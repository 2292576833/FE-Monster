package com.femonster.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;

public final class PlaybackForegroundService extends Service {
    private static final String CHANNEL_ID = "fe_monster_playback";
    private static final int NOTIFICATION_ID = 115;
    private static final String ACTION_PLAYBACK = "com.femonster.mobile.action.PLAYBACK";
    private static final String EXTRA_TITLE = "title";
    private static final String EXTRA_ARTIST = "artist";

    private MediaSession mediaSession;

    public static Intent playbackIntent(Context context, String title, String artist) {
        return new Intent(context, PlaybackForegroundService.class)
            .setAction(ACTION_PLAYBACK)
            .putExtra(EXTRA_TITLE, cleanText(title, "FE Monster"))
            .putExtra(EXTRA_ARTIST, cleanText(artist, "正在播放"));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        mediaSession = new MediaSession(this, "FE Monster Playback");
        mediaSession.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || !ACTION_PLAYBACK.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = cleanText(intent.getStringExtra(EXTRA_TITLE), "FE Monster");
        String artist = cleanText(intent.getStringExtra(EXTRA_ARTIST), "正在播放");
        mediaSession.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .build());
        mediaSession.setPlaybackState(new PlaybackState.Builder()
            .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build());
        Notification notification = buildNotification(title, artist);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification(String title, String artist) {
        Intent launchIntent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launchIntent, pendingFlags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return builder
            .setSmallIcon(R.drawable.ic_stat_fe_monster)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(contentIntent)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setStyle(new Notification.MediaStyle().setMediaSession(mediaSession.getSessionToken()))
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "音乐播放",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("FE Monster 后台音乐播放状态");
        channel.setSound(null, null);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private static String cleanText(String value, String fallback) {
        String text = value == null ? "" : value.trim();
        if (text.isEmpty()) text = fallback;
        return text.length() > 120 ? text.substring(0, 120) : text;
    }
}
