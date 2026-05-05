# Notification System Design

---

## Stage 1

So the basic idea here is that students need to get notified about three things
— Placements, Events and Results. I need to design the REST APIs for this and
also figure out how real-time notifications will work.

### APIs

**1. Get all notifications**
GET /api/v1/notifications
Authorization: Bearer <token>
Response:
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement",
      "message": "Google is hiring",
      "isRead": false,
      "timestamp": "2026-04-22T17:51:30Z"
    }
  ],
  "unreadCount": 5
}
```

**2. Mark a notification as read**
PATCH /api/v1/notifications/:id/read
Authorization: Bearer <token>
Response:
```json
{
  "id": "uuid",
  "isRead": true
}
```

**3. Mark all as read**
PATCH /api/v1/notifications/read-all
Authorization: Bearer <token>
Response:
```json
{
  "updatedCount": 5
}
```

**4. Get top N priority notifications**
GET /api/v1/notifications/priority?n=10
Authorization: Bearer <token>
Response:
```json
{
  "notifications": [...]
}
```

### Real-Time Notifications

I would use WebSockets for this. When a student logs in, they open a persistent
WebSocket connection. When a new notification is created, the server pushes it
directly to the student. If the student is offline, they get it via the REST API
when they log back in. This avoids polling and gives instant updates.

---

## Stage 2

### Database Choice — PostgreSQL

I'd go with PostgreSQL. Notifications have a fixed structure — id, studentID,
type, message, isRead, timestamp. SQL handles this cleanly and gives strong
consistency. We don't want a student to miss a notification because of eventual
consistency issues.

### Schema

```sql
CREATE TABLE students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      VARCHAR(255) UNIQUE NOT NULL,
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  type       VARCHAR(20) CHECK (type IN ('Placement', 'Event', 'Result')),
  message    TEXT NOT NULL,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Problems as Data Grows

With 50,000 students and 5,000,000 notifications things will slow down fast:

- Every query does a full table scan without indexes
- Bulk inserts when notifying all students will choke the DB
- Too many simultaneous connections will exhaust the connection pool

I'd solve these with proper indexes, a message queue for bulk operations, and
read replicas for SELECT queries.

---

## Stage 3

### The Slow Query

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

The query is logically correct but with 5 million rows and no index it does a
full table scan every single time — very slow.

### Should We Index Every Column?

No. That's bad advice. Indexes take up storage and slow down writes. Indexing
a low cardinality column like `isRead` (only true/false) barely helps on its own.

### Better Approach — Composite Index

```sql
CREATE INDEX idx_notifications_student_read_created
ON notifications (student_id, is_read, created_at DESC);
```

This covers the WHERE clause and ORDER BY together. Query goes from scanning
millions of rows to jumping directly to the right ones.

### Placement Notifications in Last 7 Days

```sql
SELECT DISTINCT student_id
FROM notifications
WHERE type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days';
```

---

## Stage 4

### The Problem

Fetching notifications from the DB on every page load for every student is
hammering the database unnecessarily.

### Solution — Redis Caching + Pagination

**Redis caching** is the cleanest fix. Cache each student's notifications with
a TTL of ~60 seconds. On page load, check Redis first. Only hit the DB on a
cache miss. When a new notification arrives, invalidate that student's cache.

Tradeoff: notifications could be up to 60 seconds stale — acceptable for most
cases. Benefit: DB load drops dramatically.

**Pagination** ensures we never load all notifications at once. Always fetch
20 at a time.

The WebSocket from Stage 1 still handles real-time pushes so the user gets new
notifications instantly even with caching in place.

---

## Stage 5

### What's Wrong with This Implementation
function notify_all(student_ids, message):
for student_id in student_ids:
send_email(student_id, message)
save_to_db(student_id, message)
push_to_app(student_id, message)

Problems:
- Completely synchronous — looping over 50,000 students one by one will
  timeout the request
- If email fails at student 200, the remaining 49,800 never get notified
- No retry mechanism at all

### Should Email and DB Save Happen Together?

No. They should be decoupled. DB save is the source of truth and should happen
immediately. Email delivery is a side effect that can fail and be retried
independently.

### Revised Approach
function notify_all(student_ids, message):
// save all to DB in one bulk insert
bulk_save_to_db(student_ids, message)
// push each to a queue, don't block
for student_id in student_ids:
    queue.push({ student_id, message })

return 202 Accepted
worker.on('job', async (job) => {
try:
await send_email(job.student_id, job.message)
await push_to_app(job.student_id, job.message)
catch:
queue.retry(job, maxRetries=3)
})

DB save is instant and reliable. Email goes through a queue with automatic
retries. Failed jobs go to a dead letter queue for manual review. API responds
immediately with 202.

---

## Stage 6

### Priority Inbox

The goal is to always show the most important unread notifications first.
Priority is based on two things — type and recency.

| Type      | Weight |
|-----------|--------|
| Placement | 3      |
| Result    | 2      |
| Event     | 1      |

Within the same type, newer notifications rank higher.

### Priority Score Formula
priorityScore = typeWeight * 1000 + recencyScore
recencyScore  = max(0, 1000 - minutesSinceCreated)

### Keeping Top 10 Efficient

I use a **min-heap of size 10**. When a new notification arrives, I calculate
its score. If it beats the lowest score in the heap, I swap it in. This is
O(log 10) — basically constant time. The heap always holds the current top 10
without scanning everything.

For the actual implementation see `notification_app_be/index.js`.