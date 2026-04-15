import { usePlayerStore } from '@/stores/playerStore'
import { useCallback, useEffect, useRef } from 'react'

interface MediaSessionControls {
  play: () => void
  pause: () => void
  next: () => void
  prev: () => void
  seek: (time: number) => void
}

/**
 * Integrates with the MediaSession API so that hardware media keys
 * (play / pause / next / prev) and the OS media notification bar
 * control the app's synced playback.
 *
 * Requirements:
 * - A real media element (<audio>/<video>) must be playing for the
 *   browser to grant MediaSession access.  Since useHowl uses
 *   Howler.js with `html5: true`, this condition is met.
 * - The first play must be triggered by a user gesture (autoplay
 *   policy); after that, media keys work freely.
 */
export function useMediaSession({ play, pause, next, prev, seek }: MediaSessionControls) {
  // Keep the latest callbacks in refs so the action handlers never go stale
  const callbacksRef = useRef({ play, pause, next, prev, seek })

  useEffect(() => {
    callbacksRef.current = { play, pause, next, prev, seek }
  }, [play, pause, next, prev, seek])

  // Register action handlers once
  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    const ms = navigator.mediaSession

    ms.setActionHandler('play', () => callbacksRef.current.play())
    ms.setActionHandler('pause', () => callbacksRef.current.pause())
    ms.setActionHandler('nexttrack', () => callbacksRef.current.next())
    ms.setActionHandler('previoustrack', () => callbacksRef.current.prev())
    ms.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) {
        callbacksRef.current.seek(details.seekTime)
      }
    })

    return () => {
      ms.setActionHandler('play', null)
      ms.setActionHandler('pause', null)
      ms.setActionHandler('nexttrack', null)
      ms.setActionHandler('previoustrack', null)
      ms.setActionHandler('seekto', null)
    }
  }, [])

  // Update metadata + playback state reactively
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)

  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    const ms = navigator.mediaSession

    if (currentTrack) {
      ms.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist.join(' / '),
        album: currentTrack.album || '',
        artwork: currentTrack.cover ? [{ src: currentTrack.cover, sizes: '512x512', type: 'image/jpeg' }] : [],
      })
    } else {
      ms.metadata = null
    }
  }, [currentTrack])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  // Update position state for seek bar in OS media controls
  const setPositionState = useCallback(() => {
    if (!('mediaSession' in navigator)) return
    if (!duration || !isFinite(duration)) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(Math.max(0, currentTime), duration),
      })
    } catch {
      // setPositionState throws if position > duration; ignore gracefully
    }
  }, [currentTime, duration])

  useEffect(() => {
    setPositionState()
  }, [setPositionState])
}
