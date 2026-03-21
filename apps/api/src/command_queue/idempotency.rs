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
    pub fn new(max_entries: usize, ttl: Duration) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            max_entries: max_entries.max(16),
            ttl,
        }
    }

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

    fn prune_locked(map: &mut HashMap<String, CachedEntry>, ttl: Duration) {
        let now = Instant::now();
        map.retain(|_, v| now.duration_since(v.inserted_at) < ttl);
    }
}
