package in.olivepizza.pos;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

/**
 * Olive Pizza POS — Main Activity
 * Initializes notification channels on startup before any push message arrives.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "OlivePOSMainActivity";

    public static final String CHANNEL_ORDER_NEW     = "olive_order_new";
    public static final String CHANNEL_ORDER_STATUS  = "olive_order_status";
    public static final String CHANNEL_SYSTEM        = "olive_system";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        createNotificationChannels();
        super.onCreate(savedInstanceState);
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        createChannel(nm, CHANNEL_ORDER_NEW, "Olive New Online Orders", NotificationManager.IMPORTANCE_HIGH, true);
        createChannel(nm, CHANNEL_ORDER_STATUS, "Olive Order Status", NotificationManager.IMPORTANCE_HIGH, false);
        createChannel(nm, CHANNEL_SYSTEM, "Olive System Alerts", NotificationManager.IMPORTANCE_DEFAULT, false);

        Log.i(TAG, "Notification channels initialized successfully.");
    }

    private void createChannel(NotificationManager nm, String id, String name, int importance, boolean soundHigh) {
        if (nm.getNotificationChannel(id) != null) return;

        NotificationChannel channel = new NotificationChannel(id, name, importance);
        channel.enableVibration(true);
        channel.setShowBadge(true);

        Uri soundUri = android.media.RingtoneManager.getDefaultUri(
            soundHigh ? android.media.RingtoneManager.TYPE_RINGTONE : android.media.RingtoneManager.TYPE_NOTIFICATION
        );
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(soundHigh ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION)
                .build();
        channel.setSound(soundUri, attrs);

        nm.createNotificationChannel(channel);
        Log.d(TAG, "Created channel: " + id);
    }
}

