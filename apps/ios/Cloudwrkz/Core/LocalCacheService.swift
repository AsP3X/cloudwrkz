//
//  LocalCacheService.swift
//  Cloudwrkz
//
//  Clears URL cache and app caches directory. Used on logout and by "Clear local cache" in Account Settings.
//

import Foundation

enum LocalCacheService {
    /// Clears all local caches: URL response cache and app Caches directory.
    /// Call on logout to remove user-related cached data, or from Account Settings to free space.
    static func clearAll() {
        // HTTP response cache (URLSession, AsyncImage, etc.)
        URLCache.shared.removeAllCachedResponses()

        // App Caches directory (e.g. image caches, temporary files)
        if let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
            clearContents(of: caches)
        }

        // App temp directory
        let tmp = FileManager.default.temporaryDirectory
        clearContents(of: tmp)
    }

    /// Estimates the total size (in bytes) of local caches that `clearAll()` will remove.
    /// Includes URLCache disk usage, Caches directory contents, and temp directory contents.
    static func totalCacheSizeBytes() -> Int64 {
        var total: Int64 = 0

        // URLCache disk usage (memory usage is transient and not written to disk)
        total += Int64(URLCache.shared.currentDiskUsage)

        // Caches directory
        if let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
            total += directorySize(at: caches)
        }

        // Temp directory
        let tmp = FileManager.default.temporaryDirectory
        total += directorySize(at: tmp)

        return max(total, 0)
    }

    private static func clearContents(of directory: URL) {
        let fm = FileManager.default
        guard let contents = try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) else { return }
        for url in contents {
            try? fm.removeItem(at: url)
        }
    }

    private static func directorySize(at url: URL) -> Int64 {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(at: url, includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey], options: [.skipsHiddenFiles]) else {
            return 0
        }

        var total: Int64 = 0

        for case let fileURL as URL in enumerator {
            do {
                let resourceValues = try fileURL.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
                if resourceValues.isRegularFile == true, let fileSize = resourceValues.fileSize {
                    total += Int64(fileSize)
                }
            } catch {
                // Ignore individual file errors and continue
                continue
            }
        }

        return total
    }
}
