/* WHAM's consent page for Supabase's OAuth 2.1 server (ChatGPT plugin, Phase 2).
   Supabase sends a member here with ?authorization_id=… when ChatGPT asks to
   connect. They sign in (Apple or email), see what the client may do, and allow
   or cancel; Supabase then sends them back to ChatGPT. The public anon key is the
   same one the app ships. Nothing here is a secret, and no token is shown. */
(function () {
  "use strict";
  var SUPABASE_URL = "https://tzqejczkucsrtgmqgisr.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cWVqY3prdWNzcnRnbXFnaXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQ3NTUsImV4cCI6MjA5OTU1MDc1NX0.qCFP3iWMHhwwG03HRLq9VbfiUQZ-kxFO-OGp1J1Fn-o";
  var SECTIONS = ["loading", "signin", "consent", "bad", "framed"];

  function $(id) { return document.getElementById(id); }
  function show(id) {
    SECTIONS.forEach(function (s) { $(s).classList.toggle("hidden", s !== id); });
  }
  function say(where, text, isError) {
    var m = $(where);
    m.textContent = text;
    m.className = "msg" + (isError ? " error" : "");
  }

  /* never inside someone else's page: a hidden frame could trick a press on Allow */
  if (window.top !== window.self) {
    show("framed");
    return;
  }

  var params = new URLSearchParams(location.search);
  var authorizationId = params.get("authorization_id") || "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(authorizationId)) {
    show("bad");
    return;
  }
  /* where Apple sign-in comes back to: this page, with the same request */
  var here = location.origin + location.pathname + "?authorization_id=" + encodeURIComponent(authorizationId);

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: "wham-consent" },
  });

  function leave(url) {
    // Supabase gives the client's registered redirect; only ever https, or this Mac for local tests
    if (typeof url === "string" && (/^https:\/\//.test(url) || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url))) {
      location.replace(url);
    } else {
      show("bad");
    }
  }

  function askConsent() {
    show("loading");
    sb.auth.oauth.getAuthorizationDetails(authorizationId).then(function (r) {
      if (r.error || !r.data) return show("bad");
      // already allowed before: straight back to the client
      if (r.data.redirect_url) return leave(r.data.redirect_url);
      var clientName = (r.data.client && r.data.client.name) || "This app";
      $("ask").textContent = "Connect " + clientName + " to your WHAM account?";
      $("who").textContent = (r.data.user && r.data.user.email) || "your WHAM account";
      show("consent");
    }).catch(function () { show("bad"); });
  }

  function decide(allow) {
    $("allow").disabled = true;
    $("deny").disabled = true;
    say("consentmsg", allow ? "Connecting…" : "Cancelling…");
    var call = allow ? sb.auth.oauth.approveAuthorization : sb.auth.oauth.denyAuthorization;
    call.call(sb.auth.oauth, authorizationId, { skipBrowserRedirect: true }).then(function (r) {
      if (r.error || !r.data || !r.data.redirect_url) {
        $("allow").disabled = false;
        $("deny").disabled = false;
        return say("consentmsg", "That didn't work. Go back to ChatGPT and try connecting again.", true);
      }
      leave(r.data.redirect_url);
    }).catch(function () {
      $("allow").disabled = false;
      $("deny").disabled = false;
      say("consentmsg", "Couldn't reach WHAM. Check your connection and try again.", true);
    });
  }

  $("allow").addEventListener("click", function () { decide(true); });
  $("deny").addEventListener("click", function () { decide(false); });
  $("switch").addEventListener("click", function () {
    sb.auth.signOut({ scope: "local" }).finally(function () { show("signin"); });
  });

  $("apple").addEventListener("click", function () {
    $("apple").disabled = true;
    sb.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: here } }).then(function (r) {
      if (r.error) {
        $("apple").disabled = false;
        say("signinmsg", "Apple sign-in isn't available right now. Try email, or go back to ChatGPT and try again later.", true);
      }
    });
  });

  $("pwform").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("email").value.trim();
    var password = $("password").value;
    if (!email || !password) return say("signinmsg", "Enter your email and password.", true);
    $("pwgo").disabled = true;
    say("signinmsg", "Signing in…");
    sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      $("pwgo").disabled = false;
      $("password").value = "";
      if (r.error) return say("signinmsg", "That email and password didn't match a WHAM account.", true);
      say("signinmsg", "");
      askConsent();
    }).catch(function () {
      $("pwgo").disabled = false;
      say("signinmsg", "Couldn't reach WHAM. Check your connection and try again.", true);
    });
  });

  sb.auth.getSession().then(function (r) {
    // back from Apple: the code in the address has become a session; tidy the address
    if (params.has("code")) history.replaceState(null, "", here);
    if (r.data && r.data.session) askConsent();
    else show("signin");
  }).catch(function () { show("signin"); });
})();
