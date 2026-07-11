package chat.holt.android

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

class SseService : Service() {

  private val conns = ConcurrentHashMap<String, Conn>()
  @Volatile private var appForeground = true
  @Volatile private var notifEnabled = true
  private val muted = ConcurrentHashMap.newKeySet<String>()
  private var startedForeground = false

  private inner class Conn(val url: String, val token: String) {
    @Volatile var running = true
    @Volatile var selfUser: String? = null
    var lastId: String? = null
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_FOREGROUND -> {
        appForeground = intent.getBooleanExtra(EXTRA_FOREGROUND, true)
        if (!startedForeground && conns.isEmpty()) { stopSelf(); return START_NOT_STICKY }
      }
      ACTION_SYNC -> {
        ensureForeground()
        reconcile(intent.getStringExtra(EXTRA_SESSIONS) ?: "[]")
        if (conns.isEmpty()) { stopForegroundCompat(); stopSelf(); return START_NOT_STICKY }
      }
      ACTION_NOTIFCONFIG -> {
        setNotifConfig(intent.getStringExtra(EXTRA_NOTIFCONFIG) ?: "{}")
        if (!startedForeground && conns.isEmpty()) { stopSelf(); return START_NOT_STICKY }
      }
      else -> ensureForeground()
    }
    return START_STICKY
  }

  private fun reconcile(json: String) {
    val wanted = HashMap<String, String>()
    try {
      val arr = JSONArray(json)
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        val url = o.optString("url"); val token = o.optString("token")
        if (url.isNotBlank() && token.isNotBlank()) wanted[token] = url.trimEnd('/')
      }
    } catch (e: Exception) {}
    for (token in conns.keys.toList()) if (!wanted.containsKey(token)) conns.remove(token)?.let { it.running = false }
    for ((token, url) in wanted) if (!conns.containsKey(token)) {
      val c = Conn(url, token); conns[token] = c; startConn(c)
    }
  }

  private fun startConn(conn: Conn) = thread(isDaemon = true, name = "sse") {
    var backoff = 1000L
    while (conn.running) {
      var http: HttpURLConnection? = null
      try {
        if (conn.selfUser==null) conn.selfUser = fetchSelf(conn)
        // /stream authenticates via the ?authorization query param (logged_in(stream=True)), not the header
        http = (URL(conn.url + "/api/v1/stream?authorization=Bearer%20" + conn.token).openConnection() as HttpURLConnection).apply {
          setRequestProperty("Accept", "text/event-stream")
          conn.lastId?.let { setRequestProperty("Last-Event-ID", it) }
          connectTimeout = 15000
          readTimeout = 125000
        }
        val code = http.responseCode
        if (code==401 || code==419 || code==403) break
        if (code==200) {
          backoff = 1000L
          val reader = http.inputStream.bufferedReader()
          var event = "message"; val data = StringBuilder()
          while (conn.running) {
            val line = reader.readLine() ?: break
            when {
              line.startsWith("event:") -> event = line.substring(6).trim()
              line.startsWith("data:") -> data.append(line.substring(5).trim())
              line.startsWith("id:") -> conn.lastId = line.substring(3).trim()
              line.isEmpty() -> { if (data.isNotEmpty()) dispatch(conn, event, data.toString()); event = "message"; data.setLength(0) }
            }
          }
        }
      } catch (e: Exception) {
      } finally { http?.disconnect() }
      if (!conn.running) break
      try { Thread.sleep(backoff) } catch (e: InterruptedException) { break }
      backoff = minOf(backoff * 2, 30000L)
    }
    conns.values.remove(conn)
  }

  private fun fetchSelf(conn: Conn): String? = try {
    val c = (URL(conn.url + "/api/v1/me").openConnection() as HttpURLConnection).apply {
      setRequestProperty("Authorization", "Bearer ${conn.token}"); connectTimeout = 15000; readTimeout = 15000
    }
    if (c.responseCode==200) JSONObject(c.inputStream.bufferedReader().readText()).optString("username").ifBlank { null } else null
  } catch (e: Exception) { null }

  private fun setNotifConfig(json: String) {
    try {
      val o = JSONObject(json)
      notifEnabled = o.optBoolean("enabled", true)
      muted.clear()
      o.optJSONArray("muted")?.let { for (i in 0 until it.length()) muted.add(it.optString(i)) }
    } catch (e: Exception) {}
  }

  private fun dispatch(conn: Conn, event: String, data: String) {
    if (event!="message_sent" || appForeground) return
    try {
      val obj = JSONObject(data)
      val channelId = obj.optString("channel_id").ifBlank { return }
      if (!notifEnabled || muted.contains(channelId)) return
      val msg = obj.optJSONObject("message") ?: return
      val user = msg.optJSONObject("user")
      val username = user?.takeIf { !it.isNull("username") }?.optString("username")?.ifBlank { null }
      if (username!=null && username==conn.selfUser) return
      val display = user?.takeIf { !it.isNull("display") }?.optString("display")?.ifBlank { null } ?: username ?: getString(R.string.app_name)
      notifyMessage(channelId, display)
    } catch (e: Exception) {}
  }

  private fun notifyMessage(channelId: String, sender: String) {
    val nm = NotificationManagerCompat.from(this)
    if (!nm.areNotificationsEnabled()) return
    val tap = PendingIntent.getActivity(this, channelId.hashCode(),
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra(MainActivity.EXTRA_CHANNEL, channelId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val n = NotificationCompat.Builder(this, HoltApp.CH_MESSAGES)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(sender)
      .setContentText(getString(R.string.new_message))
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setContentIntent(tap)
      .build()
    try { nm.notify(channelId.hashCode(), n) } catch (e: SecurityException) {}
  }

  private fun ensureForeground() {
    if (startedForeground) return
    val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val n: Notification = NotificationCompat.Builder(this, HoltApp.CH_SERVICE)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(getString(R.string.notif_service_title))
      .setContentText(getString(R.string.notif_service_text))
      .setOngoing(true)
      .setContentIntent(open)
      .build()
    if (Build.VERSION.SDK_INT>=Build.VERSION_CODES.Q)
      startForeground(SERVICE_NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    else startForeground(SERVICE_NOTIF_ID, n)
    startedForeground = true
  }

  @Suppress("DEPRECATION")
  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT>=Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else stopForeground(true)
    startedForeground = false
  }

  override fun onDestroy() {
    for (c in conns.values) c.running = false
    conns.clear()
    super.onDestroy()
  }

  companion object {
    const val ACTION_SYNC = "chat.holt.android.SYNC"
    const val ACTION_FOREGROUND = "chat.holt.android.FOREGROUND"
    const val ACTION_NOTIFCONFIG = "chat.holt.android.NOTIFCONFIG"
    const val EXTRA_SESSIONS = "sessions"
    const val EXTRA_FOREGROUND = "foreground"
    const val EXTRA_NOTIFCONFIG = "notifconfig"
    const val SERVICE_NOTIF_ID = 1001
  }
}
