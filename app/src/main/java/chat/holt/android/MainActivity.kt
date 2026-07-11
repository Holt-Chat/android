package chat.holt.android

import android.Manifest
import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.widget.Toast
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import org.json.JSONObject
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : AppCompatActivity() {

  private lateinit var webView: WebView
  private var filePathCallback: ValueCallback<Array<Uri>>? = null
  private var isForeground = true

  private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    val cb = filePathCallback ?: return@registerForActivityResult
    cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
    filePathCallback = null
  }

  private val requestNotif = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
  private var pendingWebPermission: PermissionRequest? = null
  private val requestAv = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
    val req = pendingWebPermission ?: return@registerForActivityResult
    if (grants.values.all { it }) req.grant(req.resources) else req.deny()
    pendingWebPermission = null
  }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    val splash = installSplashScreen()
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, false)

    val loader = WebViewAssetLoader.Builder()
      .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
      .build()

    val root = FrameLayout(this)
    root.setBackgroundColor(0xFF141219.toInt())
    webView = WebView(this)
    root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    setContentView(root)
    webView.setBackgroundColor(0xFF141219.toInt())

    val isDark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES
    WindowInsetsControllerCompat(window, root).apply {
      isAppearanceLightStatusBars = !isDark
      isAppearanceLightNavigationBars = !isDark
    }
    ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(root)

    webView.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      databaseEnabled = true
      mediaPlaybackRequiresUserGesture = false
      allowFileAccess = false
      allowContentAccess = false
      cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
      useWideViewPort = true
      loadWithOverviewMode = true
      setSupportMultipleWindows(false)
    }
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
    if (Build.VERSION.SDK_INT>=Build.VERSION_CODES.O) WebView.setWebContentsDebuggingEnabled(true)
    webView.addJavascriptInterface(HoltBridge(this), "HoltNative")

    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      WebViewCompat.addDocumentStartJavaScript(webView, docStartScript(), setOf("https://appassets.androidplatform.net"))
    }

    webView.webViewClient = object : WebViewClient() {
      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        loader.shouldInterceptRequest(request.url)

      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url
        if (url.host=="appassets.androidplatform.net") return false
        if (url.scheme=="http" || url.scheme=="https") {
          startActivity(Intent(Intent.ACTION_VIEW, url))
          return true
        }
        return true
      }

      override fun onPageFinished(view: WebView, url: String?) {
        view.evaluateJavascript(syncScript(), null)
      }

      override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
        // The WebView renderer died (usually OOM, e.g. camera + QR decoding). Rebuild the activity
        // instead of letting the system kill the whole app. localStorage (session/keys) survives.
        (view.parent as? android.view.ViewGroup)?.removeView(view)
        view.destroy()
        if (!isFinishing) recreate()
        return true
      }
    }

    webView.webChromeClient = object : WebChromeClient() {
      override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = cb
        return try { fileChooser.launch(params.createIntent()); true } catch (e: Exception) { filePathCallback = null; false }
      }
      override fun onPermissionRequest(request: PermissionRequest) {
        runOnUiThread {
          val need = mutableListOf<String>()
          for (res in request.resources) {
            if (res==PermissionRequest.RESOURCE_AUDIO_CAPTURE) need.add(Manifest.permission.RECORD_AUDIO)
            if (res==PermissionRequest.RESOURCE_VIDEO_CAPTURE) need.add(Manifest.permission.CAMERA)
          }
          val missing = need.filter { ContextCompat.checkSelfPermission(this@MainActivity, it)!=PackageManager.PERMISSION_GRANTED }
          if (missing.isEmpty()) request.grant(request.resources)
          else { pendingWebPermission = request; requestAv.launch(missing.toTypedArray()) }
        }
      }
    }

    webView.setDownloadListener { url, _, _, _, _ ->
      try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: Exception) {}
    }

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript("(window.__holtBack&&window.__holtBack())?true:false") { r ->
          if (r=="true") return@evaluateJavascript
          if (webView.canGoBack()) webView.goBack() else finish()
        }
      }
    })

    if (savedInstanceState==null) webView.loadUrl(START_URL)
    handleIntent(intent)

    if (Build.VERSION.SDK_INT>=Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
      requestNotif.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    if (savedInstanceState==null) checkForUpdate()
  }

  private fun checkForUpdate() {
    thread {
      try {
        val conn = (URL(RELEASES_API).openConnection() as HttpURLConnection).apply {
          connectTimeout = 8000; readTimeout = 8000
          setRequestProperty("Accept", "application/vnd.github+json")
        }
        if (conn.responseCode!=200) return@thread
        val obj = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        if (obj.optBoolean("draft") || obj.optBoolean("prerelease")) return@thread
        val tag = obj.optString("tag_name").trim()
        if (tag.isBlank()) return@thread
        val latest = tag.removePrefix("v").removePrefix("V")
        val current = (packageManager.getPackageInfo(packageName, 0).versionName ?: "").trim()
        if (compareVersions(latest, current)<=0) return@thread
        if (getSharedPreferences("holt", MODE_PRIVATE).getString("skip_version", null)==tag) return@thread
        val pageUrl = obj.optString("html_url").ifBlank { RELEASES_PAGE }
        runOnUiThread { showUpdateDialog(latest, current, tag, pageUrl) }
      } catch (e: Exception) {}
    }
  }

  private fun showUpdateDialog(latest: String, current: String, tag: String, pageUrl: String) {
    if (isFinishing) return
    AlertDialog.Builder(this)
      .setTitle(R.string.update_title)
      .setMessage(getString(R.string.update_message, latest, current))
      .setPositiveButton(R.string.update_now) { _, _ -> try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(pageUrl))) } catch (e: Exception) {} }
      .setNegativeButton(R.string.update_skip, null)
      .setNeutralButton(R.string.update_never) { _, _ -> getSharedPreferences("holt", MODE_PRIVATE).edit().putString("skip_version", tag).apply() }
      .show()
  }

  private fun compareVersions(a: String, b: String): Int {
    val pa = a.split("."); val pb = b.split(".")
    for (i in 0 until maxOf(pa.size, pb.size)) {
      val x = pa.getOrNull(i)?.toIntOrNull() ?: 0
      val y = pb.getOrNull(i)?.toIntOrNull() ?: 0
      if (x!=y) return x-y
    }
    return 0
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleIntent(intent)
  }

  private fun handleIntent(intent: Intent?) {
    val channel = intent?.getStringExtra(EXTRA_CHANNEL) ?: return
    if (channel.isBlank()) return
    val js = "(function(){try{if(window.loadChannel&&window.channels&&window.channels.find(c=>c.id==='${channel.replace("'", "")}'))window.loadChannel('${channel.replace("'", "")}');}catch(e){}})();"
    webView.postDelayed({ webView.evaluateJavascript(js, null) }, 400)
  }

  fun onSessionsSynced(json: String) {
    val svc = Intent(this, SseService::class.java).setAction(SseService.ACTION_SYNC).putExtra(SseService.EXTRA_SESSIONS, json)
    ContextCompat.startForegroundService(this, svc)
  }

  fun saveDownload(base64: String, filename: String, mimetype: String) {
    thread {
      try {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        val name = filename.replace(Regex("[/\\\\]"), "_").ifBlank { "download" }
        val mime = mimetype.ifBlank { "application/octet-stream" }
        if (Build.VERSION.SDK_INT>=Build.VERSION_CODES.Q) {
          val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mime)
            put(MediaStore.Downloads.IS_PENDING, 1)
          }
          val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
          if (uri==null) { toast("Download failed"); return@thread }
          contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
          values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0)
          contentResolver.update(uri, values, null, null)
          toast("Saved $name to Downloads")
        } else {
          val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
          dir.mkdirs()
          val f = File(dir, name); f.outputStream().use { it.write(bytes) }
          toast("Saved to Downloads/$name")
        }
      } catch (e: Exception) { toast("Download failed") }
    }
  }

  private fun toast(msg: String) = runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_LONG).show() }

  fun syncNotifConfig(json: String) {
    if (json.isBlank()) return
    try { startService(Intent(this, SseService::class.java).setAction(SseService.ACTION_NOTIFCONFIG).putExtra(SseService.EXTRA_NOTIFCONFIG, json)) } catch (e: Exception) {}
  }

  fun notifGranted(): Boolean =
    Build.VERSION.SDK_INT<Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED

  fun batteryUnrestricted(): Boolean =
    (getSystemService(POWER_SERVICE) as android.os.PowerManager).isIgnoringBatteryOptimizations(packageName)

  fun requestNotifications() {
    if (Build.VERSION.SDK_INT>=Build.VERSION_CODES.TIRAMISU && !notifGranted()) requestNotif.launch(Manifest.permission.POST_NOTIFICATIONS)
    else openNotificationSettings()
  }

  fun openNotificationSettings() {
    val i = Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName)
    try { startActivity(i) } catch (e: Exception) { openAppInfo() }
  }

  @SuppressLint("BatteryLife")
  fun requestBatteryExemption() {
    val i = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
    try { startActivity(i) } catch (e: Exception) { openAppInfo() }
  }

  fun openAppInfo() {
    try { startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } catch (e: Exception) {}
  }

  private fun dirSize(f: File): Long = if (!f.exists()) 0L else if (f.isFile) f.length() else (f.listFiles()?.sumOf { dirSize(it) } ?: 0L)

  fun cacheBytes(): Long = dirSize(cacheDir) + dirSize(File(applicationInfo.dataDir, "app_webview/Default/HTTP Cache"))

  fun clearCache() {
    runOnUiThread { webView.clearCache(true) }
    thread { try { cacheDir.listFiles()?.forEach { it.deleteRecursively() } } catch (e: Exception) {}; toast(getString(R.string.cache_cleared)) }
  }

  fun onForegroundChanged(foreground: Boolean) {
    isForeground = foreground
    startService(Intent(this, SseService::class.java).setAction(SseService.ACTION_FOREGROUND).putExtra(SseService.EXTRA_FOREGROUND, foreground))
  }

  override fun onResume() {
    super.onResume(); onForegroundChanged(true)
  }
  override fun onPause() {
    super.onPause(); onForegroundChanged(false)
  }

  override fun onDestroy() {
    if (isFinishing) webView.destroy()
    super.onDestroy()
  }

  private fun docStartScript(): String =
    """(function(){try{if(!localStorage.getItem('servers')){localStorage.setItem('servers',JSON.stringify([{id:(Math.floor(Math.random()*(16*16*16*16*16*16*16*16))).toString(16),name:null,url:"$DEFAULT_SERVER"}]));}}catch(e){}
window.__holtBack=function(){try{var d=[].slice.call(document.querySelectorAll('dialog[open]')).filter(function(x){return x.id!=='server-modal';});if(d.length){d[d.length-1].close();return true;}if(window.smallScreen&&window.smallScreen()){var s=document.querySelector('side'),m=document.querySelector('main');if(s&&m&&m.style.display!=='none'&&s.style.display==='none'){s.style.display='';m.style.display='none';var lt=document.querySelector('.lateraltoggle');if(lt)lt.style.display='';window.currentChannel='';return true;}}}catch(e){}return false;};})();"""

  private fun syncScript(): String =
    """(function(){function c(){try{var a=JSON.parse(localStorage.getItem('servers')||'[]');var o=[];for(var i=0;i<a.length;i++){var t=localStorage.getItem(a[i].id+'-sessionToken');if(t)o.push({url:a[i].url,token:t});}HoltNative.syncSessions(JSON.stringify(o));}catch(e){}}c();if(!window.__holtHook){window.__holtHook=true;var s=localStorage.setItem.bind(localStorage);localStorage.setItem=function(k,v){s(k,v);if(k==='servers'||/-sessionToken${'$'}/.test(k))setTimeout(c,80);};var r=localStorage.removeItem.bind(localStorage);localStorage.removeItem=function(k){r(k);if(/-sessionToken${'$'}/.test(k))setTimeout(c,80);};document.addEventListener('visibilitychange',function(){try{HoltNative.setForeground(document.visibilityState==='visible');}catch(e){}});}
if(!window.__holtDl){window.__holtDl=true;try{var _co=URL.createObjectURL.bind(URL),_bm={};URL.createObjectURL=function(o){var u=_co(o);try{if(o&&o instanceof Blob)_bm[u]=o;}catch(e){}return u;};var _ro=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=function(u){try{delete _bm[u];}catch(e){}return _ro(u);};var _cl=HTMLAnchorElement.prototype.click;function _snd(b,n){var fr=new FileReader();fr.onload=function(){var d=String(fr.result||'');var i=d.indexOf(',');try{HoltNative.saveBase64(i>=0?d.substring(i+1):d,n,b.type||'application/octet-stream');}catch(e){}};fr.readAsDataURL(b);}HTMLAnchorElement.prototype.click=function(){try{var h=this.getAttribute('href')||this.href;if(this.hasAttribute('download')&&h){var n=this.getAttribute('download')||'download';if(_bm[h]){_snd(_bm[h],n);return;}if(h.indexOf('blob:')===0||h.indexOf('data:')===0){fetch(h).then(function(r){return r.blob();}).then(function(b){_snd(b,n);}).catch(function(e){});return;}}}catch(e){}return _cl.apply(this,arguments);};document.addEventListener('click',function(ev){try{var a=ev.target&&ev.target.closest?ev.target.closest('a[download]'):null;if(!a)return;var h=a.getAttribute('href')||a.href;if(!h)return;if(_bm[h]||h.indexOf('blob:')===0||h.indexOf('data:')===0){ev.preventDefault();var n=a.getAttribute('download')||'download';if(_bm[h]){_snd(_bm[h],n);return;}fetch(h).then(function(r){return r.blob();}).then(function(b){_snd(b,n);}).catch(function(e){});}}catch(e){}},true);}catch(e){}}})();"""

  companion object {
    const val DEFAULT_SERVER = "https://app.holtchat.xyz"
    const val START_URL = "https://appassets.androidplatform.net/assets/shore/index.html"
    const val EXTRA_CHANNEL = "channel_id"
    const val RELEASES_API = "https://api.github.com/repos/Holt-Chat/android/releases/latest"
    const val RELEASES_PAGE = "https://github.com/Holt-Chat/android/releases"
  }
}
