//! In-memory idempotency cache: same user + key + route + body hash returns the prior HTTP JSON outcome within TTL.

// Human: Clients that retry POSTs on network blips get the same response body without double-applying side effects when they send `Idempotency-Key`.
// Agent: Mutex HashMap key user_id:key; get MATCHES route body_hash ttl; put EVICTS oldest when at max_entries; prune_locked on each access.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::Mutex;

use super::broker::JsonMutationResult;

#[derive(Clone)]
pub struct IdempotencyStore {
    inner: Arc<Mutex<HashMap<String, CachedEntry>>>,
    max_entries: usize,
    ttl: Duration,
}

struct CachedEntry {
    inserted_at: Instant,
    route: String,
    body_hash: u64,
    result: JsonMutationResult,
}

impl IdempotencyStore {
    // Human: Capacity floor prevents accidental `0` max from creating an unusable store in tests.
    // Agent: inner Arc Mutex new; max_entries.max(16); STORES ttl Duration.

    pub fn new(max_entries: usize, ttl: Duration) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            max_entries: max_entries.max(16),
            ttl,
        }
    }

    // Human: A cache hit only counts when the route and body hash match so the same key on different endpoints or payloads cannot replay stale JSON.
    // Agent: LOCK inner; prune_locked; GET map_key; FILTER route body_hash elapsed < ttl; CLONE JsonMutationResult.

    pub async fn get(
        &self,
        user_id: &str,
        key: &str,
        route: &str,
        body_hash: u64,
    ) -> Option<JsonMutationResult> {
        let map_key = format!("{user_id}:{key}");
        let mut g = self.inner.lock().await;
        Self::prune_locked(&mut g, self.ttl);
        g.get(&map_key).and_then(|e| {
            if e.route == route && e.body_hash == body_hash && e.inserted_at.elapsed() < self.ttl {
                Some(e.result.clone())
            } else {
                None
            }
        })
    }

    // Human: When the map is full we drop the single oldest entry by insertion time, which is coarse but avoids unbounded RAM growth.
    // Agent: prune_locked; IF len >= max_entries REMOVE min inserted_at key; INSERT CachedEntry Instant::now.

    pub async fn put(
        &self,
        user_id: &str,
        key: &str,
        route: &str,
        body_hash: u64,
        result: JsonMutationResult,
    ) {
        let map_key = format!("{user_id}:{key}");
        let mut g = self.inner.lock().await;
        Self::prune_locked(&mut g, self.ttl);
        if g.len() >= self.max_entries {
            let oldest = g
                .iter()
                .min_by_key(|(_, v)| v.inserted_at)
                .map(|(k, _)| k.clone());
            if let Some(k) = oldest {
                g.remove(&k);
            }
        }
        g.insert(
            map_key,
            CachedEntry {
                inserted_at: Instant::now(),
                route: route.to_string(),
                body_hash,
                result,
            },
        );
    }

    // Human: Expired entries are removed eagerly on every read/write so hot keys do not leave dead rows behind forever.
    // Agent: retain inserted_at elapsed < ttl.

    fn prune_locked(map: &mut HashMap<String, CachedEntry>, ttl: Duration) {
        let now = Instant::now();
        map.retain(|_, v| now.duration_since(v.inserted_at) < ttl);
    }
}
