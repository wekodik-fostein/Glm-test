// Java / MainActivity.java / Android 7+ / WebView host, native hints, injected glass settings.
package com.erafox.chessassist;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

public class MainActivity extends Activity {

    private FrameLayout root;
    private WebView web;
    private HintView hint;
    private AvatarButtonView avatarBtn;
    private AssistConfig cfg;
    private String stockfishWrapped;
    private String cheatScript;
    private String guiScript;
    private String avatarData;
    private String boardData;
    private String browserShim;
    private String ua;
    private String uaMajor = "126";
    private boolean guiVisible;
    private final Handler poll = new Handler(Looper.getMainLooper());
    private final Random rnd = new Random();

    private final Runnable configPush = this::pushConfig;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        cfg = AssistConfig.load(this);
        stockfishWrapped = readAsset("stockfish.js");
        cheatScript = readAsset("cheat.js");
        guiScript = readAsset("gui.js");
        avatarData = readAssetBase64("profile.jpg");
        boardData = readAssetBase64("board.webp");
        ua = browserUa();
        browserShim = makeShim();

        root = new FrameLayout(this);
        web = new WebView(this);
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void closeGui() {
                runOnUiThread(MainActivity.this::closeSettings);
            }

            @JavascriptInterface
            public void register(String payload, String action) {
                runOnUiThread(() -> submitRegistration(payload, action));
            }
        }, "caHost");
        applyWebSettings(web.getSettings());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return handleUrl(req.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return handleUrl(url);
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                injectShim();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectShim();
                poll.postDelayed(MainActivity.this::injectEngine, 900 + rnd.nextInt(900));
                injectGui();
                if (url != null && url.contains("chess.com/register")) injectRegisterHook();
                if (guiVisible) web.evaluateJavascript("window.__caGui&&window.__caGui.open()", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient());

        FrameLayout.LayoutParams full = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        root.addView(web, full);

        hint = new HintView(this);
        hint.setStyle(cfg.arrows, cfg.fromColor, cfg.toColor, cfg.arrowColor);
        root.addView(hint, full);

        avatarBtn = new AvatarButtonView(this, "profile.jpg");
        avatarBtn.setContentDescription("настройки");
        FrameLayout.LayoutParams bp = new FrameLayout.LayoutParams(dp(48), dp(48));
        bp.gravity = Gravity.RIGHT | Gravity.CENTER_VERTICAL;
        bp.rightMargin = dp(8);
        root.addView(avatarBtn, bp);
        avatarBtn.setOnClickListener(v -> openSettings());

        setContentView(root);

        // Login/session cookies must survive and work inside the embedded
        // WebView; chess.com's auth flow also touches third-party endpoints.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) cookies.setAcceptThirdPartyCookies(web, true);

        Map<String, String> h = new HashMap<>();
        h.put("X-Requested-With", "");
        h.put("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7");
        h.put("Upgrade-Insecure-Requests", "1");
        web.loadUrl("https://www.chess.com/", h);
        poll.postDelayed(this::tick, 300);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    // ---------- injected glass panel ----------

    private void injectGui() {
        if (web == null || guiScript == null || guiScript.isEmpty()) return;
        String avatar = "window.__caGuiAvatar="
                + JSONObject.quote("data:image/jpeg;base64," + avatarData) + ";";
        String board = "window.__caBoardSheet="
                + JSONObject.quote("data:image/webp;base64," + boardData) + ";";
        web.evaluateJavascript(avatar + board + guiScript, null);
        web.evaluateJavascript("window.__caGui&&window.__caGui.apply(" + cfg.json() + ")", null);
    }

    // Registration stays inside the WebView (Turnstile needs the real page),
    // but the final POST is sent by the native client below. Android WebView
    // stamps every request with X-Requested-With: <package>, which chess.com
    // reads as "webview" and answers with RG45. The native request has clean
    // Chrome headers, reuses the WebView cookies / cf_clearance and the
    // Turnstile token, so the server sees an ordinary browser form submit.
    private void injectRegisterHook() {
        if (web == null) return;
        String js = "(function(){"
                + "if(window.__caRegHook)return;window.__caRegHook=1;"
                + "function grab(f){try{"
                + "var fd=new FormData(f),o={},n=0;"
                + "fd.forEach(function(v,k){if(typeof v==='string'){o[k]=v;n++;}});"
                + "if(!n)return false;"
                + "if(window.caHost&&window.caHost.register){"
                + "window.__caRegForm=f;"
                + "window.caHost.register(JSON.stringify(o),f.action||location.href);"
                + "return true;}"
                + "}catch(e){}return false;}"
                + "var orig=HTMLFormElement.prototype.submit;"
                + "HTMLFormElement.prototype.submit=function(){"
                + "if(this.action&&this.action.indexOf('chess.com/register')>=0&&grab(this))return;"
                + "return orig.apply(this,arguments);};"
                + "document.addEventListener('submit',function(e){"
                + "var f=e.target;"
                + "if(f&&f.action&&f.action.indexOf('chess.com/register')>=0&&grab(f))"
                + "e.preventDefault();},true);"
                + "window.__caRegFallback=function(){try{"
                + "if(window.__caRegForm)orig.apply(window.__caRegForm,[]);}catch(e){}};"
                + "})();";
        web.evaluateJavascript(js, null);
    }

    private void submitRegistration(final String payload, final String action) {
        if (web == null || payload == null || action == null) return;
        final String page = web.getUrl();
        if (page == null || page.indexOf("chess.com") < 0) return;
        if (!action.startsWith("https://www.chess.com/register")) return;
        if (payload.length() > 65536) return;
        new Thread(() -> {
            int code = 0;
            String location = null, body = "";
            try {
                JSONObject form = new JSONObject(payload);
                StringBuilder sb = new StringBuilder();
                java.util.Iterator<String> keys = form.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    Object raw = form.opt(k);
                    String v = (raw == null || raw == JSONObject.NULL) ? "" : String.valueOf(raw);
                    if (sb.length() > 0) sb.append('&');
                    sb.append(URLEncoder.encode(k, "UTF-8")).append('=')
                            .append(URLEncoder.encode(v, "UTF-8"));
                }
                byte[] data = sb.toString().getBytes("UTF-8");
                HttpURLConnection c = (HttpURLConnection) new URL(action).openConnection();
                c.setRequestMethod("POST");
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(data.length);
                c.setRequestProperty("User-Agent", ua);
                c.setRequestProperty("Accept",
                        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8");
                c.setRequestProperty("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7");
                c.setRequestProperty("Accept-Encoding", "gzip, deflate");
                c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                c.setRequestProperty("Origin", "https://www.chess.com");
                c.setRequestProperty("Referer", "https://www.chess.com/register");
                c.setRequestProperty("Upgrade-Insecure-Requests", "1");
                c.setRequestProperty("Sec-Fetch-Dest", "document");
                c.setRequestProperty("Sec-Fetch-Mode", "navigate");
                c.setRequestProperty("Sec-Fetch-Site", "same-origin");
                c.setRequestProperty("Sec-Fetch-User", "?1");
                c.setRequestProperty("Cache-Control", "max-age=0");
                c.setRequestProperty("Sec-CH-UA", "\"Chromium\";v=\"" + uaMajor
                        + "\", \"Google Chrome\";v=\"" + uaMajor + "\", \"Not?A_Brand\";v=\"8\"");
                c.setRequestProperty("Sec-CH-UA-Mobile", "?1");
                c.setRequestProperty("Sec-CH-UA-Platform", "\"Android\"");
                String cookie = CookieManager.getInstance().getCookie("https://www.chess.com");
                if (cookie != null && !cookie.isEmpty()) c.setRequestProperty("Cookie", cookie);

                OutputStream out = c.getOutputStream();
                out.write(data);
                out.close();

                code = c.getResponseCode();
                location = c.getHeaderField("Location");
                Map<String, List<String>> headers = c.getHeaderFields();
                for (Map.Entry<String, List<String>> e : headers.entrySet()) {
                    if (e.getKey() == null || !"set-cookie".equalsIgnoreCase(e.getKey())) continue;
                    for (String sc : e.getValue()) {
                        CookieManager.getInstance().setCookie("https://www.chess.com", sc);
                    }
                }
                CookieManager.getInstance().flush();

                String enc = c.getContentEncoding();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                if (in != null && enc != null && enc.toLowerCase().contains("gzip")) {
                    in = new java.util.zip.GZIPInputStream(in);
                } else if (in != null && enc != null && enc.toLowerCase().contains("deflate")) {
                    in = new java.util.zip.InflaterInputStream(in);
                }
                body = readAll(in);
                c.disconnect();
            } catch (Exception e) {
                body = "";
            }

            final int fc = code;
            final String floc = location;
            final String fb = body != null ? body : "";
            runOnUiThread(() -> {
                if (web == null) return;
                if (fc >= 300 && fc < 400) {
                    if (fc == 403 || fb.contains("Just a moment") || fb.contains("cf-mitigated")) {
                        web.evaluateJavascript("window.__caRegFallback&&window.__caRegFallback()", null);
                        return;
                    }
                    String next = "https://www.chess.com/";
                    if (floc != null && !floc.isEmpty()) {
                        try { next = new URL(new URL(action), floc).toString(); }
                        catch (Exception ignored) { next = floc.startsWith("http") ? floc : "https://www.chess.com" + floc; }
                    }
                    web.loadUrl(next);
                    return;
                }
                if (fc == 0) {
                    web.evaluateJavascript("window.__caRegFallback&&window.__caRegFallback()", null);
                    return;
                }
                if (fb.contains("Just a moment") || fb.contains("cf-mitigated")) {
                    web.evaluateJavascript("window.__caRegFallback&&window.__caRegFallback()", null);
                    return;
                }
                if (fb.contains("RG45")) {
                    Toast.makeText(MainActivity.this, "chess.com: RG45", Toast.LENGTH_LONG).show();
                    web.loadDataWithBaseURL("https://www.chess.com", fb, "text/html", "UTF-8", null);
                    return;
                }
                if (fb.contains("registration-signup-form")) {
                    web.loadDataWithBaseURL("https://www.chess.com", fb, "text/html", "UTF-8", null);
                } else {
                    web.loadUrl("https://www.chess.com/");
                }
            });
        }).start();
    }

    private String readAll(InputStream in) {
        if (in == null) return "";
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > 500000) break;
            }
            in.close();
            return out.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    private void openSettings() {
        if (guiVisible) return;
        guiVisible = true;
        hint.setVisibility(View.GONE);
        avatarBtn.setVisibility(View.GONE);
        injectGui();
        web.evaluateJavascript("window.__caGui&&window.__caGui.open()", null);
    }

    private void requestClose() {
        if (!guiVisible) return;
        web.evaluateJavascript("window.__caGui&&window.__caGui.close()", null);
        poll.postDelayed(this::closeSettings, 340);
    }

    private void closeSettings() {
        if (!guiVisible) return;
        guiVisible = false;
        hint.setVisibility(View.VISIBLE);
        avatarBtn.setVisibility(View.VISIBLE);
        cfg.save(this);
        pushConfig();
    }

    private boolean handleUrl(String url) {
        if (url == null) return false;
        if (url.startsWith("ca://close")) {
            closeSettings();
            return true;
        }
        if (url.startsWith("ca://cfg")) {
            Uri u = Uri.parse(url);
            try {
                String a = u.getQueryParameter("accuracy");
                if (a != null) cfg.accuracy = Math.max(20, Math.min(100, Integer.parseInt(a)));
            } catch (Exception ignored) {}
            String accuracyOn = u.getQueryParameter("accuracyOn");
            if (accuracyOn != null) cfg.accuracyOn = "1".equals(accuracyOn);
            cfg.multi = "1".equals(u.getQueryParameter("multi"));
            cfg.arrows = "1".equals(u.getQueryParameter("arrows"));
            cfg.auto = "1".equals(u.getQueryParameter("auto"));
            try {
                String r = u.getQueryParameter("rating");
                if (r != null) cfg.rating = Math.max(400, Math.min(2900, Integer.parseInt(r)));
            } catch (Exception ignored) {}
            String timing = u.getQueryParameter("timing");
            if (timing != null) cfg.timing = "1".equals(timing);
            String focusPause = u.getQueryParameter("focusPause");
            if (focusPause != null) cfg.focusPause = "1".equals(focusPause);
            String weakMoves = u.getQueryParameter("weakMoves");
            if (weakMoves != null) cfg.weakMoves = "1".equals(weakMoves);
            String proctorGuard = u.getQueryParameter("proctorGuard");
            if (proctorGuard != null) cfg.proctorGuard = "1".equals(proctorGuard);
            parseColor(u.getQueryParameter("fromColor"), 0);
            parseColor(u.getQueryParameter("toColor"), 1);
            parseColor(u.getQueryParameter("arrowColor"), 2);
            hint.setStyle(cfg.arrows, cfg.fromColor, cfg.toColor, cfg.arrowColor);
            cfg.save(this);
            pushConfig();
            return true;
        }
        if (url.startsWith("https://t.me/") || url.startsWith("http://t.me/")) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {}
            return true;
        }
        return false;
    }

    @Override
    protected void onPause() {
        super.onPause();
        try { CookieManager.getInstance().flush(); } catch (Exception ignored) {}
    }

    private void parseColor(String value, int slot) {
        if (value == null) return;
        try {
            int c = android.graphics.Color.parseColor(value);
            if (slot == 0) cfg.fromColor = c;
            else if (slot == 1) cfg.toColor = c;
            else cfg.arrowColor = c;
        } catch (Exception ignored) {}
    }

    @Override
    public void onBackPressed() {
        if (guiVisible) {
            requestClose();
            return;
        }
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // ---------- hint bridge ----------

    private void tick() {
        readHint();
        poll.postDelayed(this::tick, 260);
    }

    private JSONObject obj(String value) {
        try {
            if (value == null) return null;
            Object v = new JSONTokener(value).nextValue();
            if (v instanceof JSONObject) return (JSONObject) v;
            if (v instanceof String) return new JSONObject((String) v);
        } catch (Exception ignored) {}
        return null;
    }

    private void readHint() {
        if (web == null || hint == null || web.getWidth() < 2 || web.getHeight() < 2) return;
        web.evaluateJavascript(
                "window.__ca&&window.__ca.getHintState?window.__ca.getHintState():null",
                value -> {
                    JSONObject o = obj(value);
                    if (o == null) { hint.clear(); return; }
                    try {
                        JSONObject v = o.getJSONObject("view");
                        float cw = (float) v.getDouble("w");
                        float ch = (float) v.getDouble("h");
                        if (cw < 1 || ch < 1) { hint.clear(); return; }
                        float sx = (float) web.getWidth() / cw;
                        float sy = (float) web.getHeight() / ch;
                        float ox = (float) v.getDouble("ox");
                        float oy = (float) v.getDouble("oy");

                        JSONArray arr = o.optJSONArray("arrows");
                        List<HintView.Hint> list = new ArrayList<>();
                        if (arr != null) {
                            for (int i = 0; i < arr.length(); i++) {
                                JSONObject it = arr.getJSONObject(i);
                                JSONObject a = it.getJSONObject("from");
                                JSONObject b = it.getJSONObject("to");
                                list.add(new HintView.Hint(
                                        (float) ((a.getDouble("x") - ox) * sx),
                                        (float) ((a.getDouble("y") - oy) * sy),
                                        (float) a.getDouble("s") * sx,
                                        (float) ((b.getDouble("x") - ox) * sx),
                                        (float) ((b.getDouble("y") - oy) * sy),
                                        (float) b.getDouble("s") * sx,
                                        it.optString("label", ""),
                                        it.optBoolean("main", false)));
                            }
                        }
                        hint.setHints(list);
                    } catch (Exception e) {
                        hint.clear();
                    }
                });
    }

    private void pushConfig() {
        if (web == null || cfg == null) return;
        web.evaluateJavascript(
                "window.__ca&&window.__ca.setConfig?window.__ca.setConfig(" + cfg.json() + "):null",
                null);
    }

    // ---------- browser normalization ----------

    private void applyWebSettings(WebSettings s) {
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(ua);
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }

    private String browserUa() {
        String ver = "126.0.0.0";
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                PackageInfo pi = WebView.getCurrentWebViewPackage();
                if (pi != null && pi.versionName != null) {
                    String v = pi.versionName.split(" ")[0];
                    if (v.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) ver = v;
                }
            }
        } catch (Exception ignored) {}
        uaMajor = ver.split("\\.")[0];
        return "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 "
                + "(KHTML, like Gecko) Chrome/" + ver + " Mobile Safari/537.36";
    }

    private String makeShim() {
        final String v = uaMajor;
        return "(function(){"
                + "try{"
                + "if(!window.chrome)window.chrome={};"
                + "if(!window.chrome.runtime)window.chrome.runtime={};"
                + "if(!window.chrome.loadTimes)window.chrome.loadTimes=function(){return{};};"
                + "if(!window.chrome.csi)window.chrome.csi=function(){return{};};"
                + "if(!window.chrome.app)window.chrome.app={};"
                + "if(!navigator.userAgentData){Object.defineProperty(navigator,"
                + "'userAgentData',{configurable:true,value:{brands:["
                + "{brand:'Chromium',version:'" + v + "'},"
                + "{brand:'Google Chrome',version:'" + v + "'},"
                + "{brand:'Not?A_Brand',version:'8'}],"
                + "mobile:true,platform:'Android',getHighEntropyValues:function(){"
                + "return Promise.resolve({architecture:'arm',bitness:'64',"
                + "brands:[{brand:'Chromium',version:'" + v + "'},"
                + "{brand:'Google Chrome',version:'" + v + "'}],"
                + "fullVersionList:[{brand:'Chromium',version:'" + v + ".0.0.0'},"
                + "{brand:'Google Chrome',version:'" + v + ".0.0.0'}],"
                + "mobile:true,model:'Pixel 6',platform:'Android',"
                + "platformVersion:'12',wow64:false});}}}});"
                + "}catch(e){}"
                + "try{Object.defineProperty(navigator,'webdriver',{configurable:true,"
                + "get:function(){return false;}});}catch(e){}"
                + "})();";
    }

    private void injectShim() {
        if (web == null) return;
        web.evaluateJavascript(browserShim, null);
    }

    private void injectEngine() {
        if (web == null) return;
        String engine =
                "(function(){"
                + "if(window.__ca&&typeof window.__ca.engineSend==='function')return;"
                + "var postMessage=function(x){"
                + "  if(typeof x==='string'&&window.__ca&&window.__ca.onEngineLine)"
                + "    window.__ca.onEngineLine(x);"
                + "};"
                + "var close=function(){};"
                + "var onmessage;"
                + stockfishWrapped
                + "\nif(window.__ca&&window.__ca.attachEngine)window.__ca.attachEngine(onmessage);"
                + "})();";
        web.evaluateJavascript(cheatScript + "\n" + engine, null);
        poll.postDelayed(this::pushConfig, 350);
    }

    private String readAsset(String name) {
        try {
            InputStream in = getAssets().open(name);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            return out.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    private String readAssetBase64(String name) {
        try {
            InputStream in = getAssets().open(name);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }
}
