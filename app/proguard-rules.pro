# Keep JS bridge interface methods (called from injected JS)
-keepclassmembers class chat.holt.android.** {
  @android.webkit.JavascriptInterface <methods>;
}
