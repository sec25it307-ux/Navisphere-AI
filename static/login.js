/* =================================================================
   U Map — Login Page JS  ·  v4 (2026-10-06)
   Handles: view switching, form validation, remember-me, password toggle,
            Google Identity Services (GSI) Sign-In
   ================================================================= */

(function () {
    'use strict';

    /* ── DOM refs ──────────────────────────────────────────────── */
    const mode        = document.body.getAttribute('data-auth-mode') || 'login';
    const loginView   = document.getElementById('loginView');
    const registerView = document.getElementById('registerView');
    const forgotView  = document.getElementById('forgotView');
    const heading     = document.getElementById('authHeading');
    const REMEMBER_KEY = 'umap-remember-email';

    /* ── View switching ────────────────────────────────────────── */
    function showView(name) {
        const map = { login: loginView, register: registerView, forgot: forgotView };
        Object.entries(map).forEach(function ([key, node]) {
            if (node) node.hidden = (key !== name);
        });
        if (heading) {
            const titles = {
                login: 'Welcome back',
                register: 'Create account',
                forgot: 'Reset password'
            };
            heading.textContent = titles[name] || 'Welcome back';
        }
    }

    /* ── Status helper ──────────────────────────────────────────── */
    function setStatus(id, msg, kind) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = msg || '';
        el.classList.remove('is-error', 'is-ok');
        if (kind) el.classList.add(kind);
    }

    /* ── Validation ─────────────────────────────────────────────── */
    function isValidEmail(val) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    }

    /* ── Password eye toggles ───────────────────────────────────── */
    document.querySelectorAll('.lp-eye-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;
            const showing = input.type === 'password';
            input.type = showing ? 'text' : 'password';
            btn.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
            btn.classList.toggle('is-visible', showing);
        });
    });

    /* ── Restore remembered email ───────────────────────────────── */
    try {
        const saved = localStorage.getItem(REMEMBER_KEY);
        const emailEl = document.getElementById('loginEmail');
        const rememberEl = document.getElementById('rememberMe');
        if (saved && emailEl) {
            emailEl.value = saved;
            if (rememberEl) rememberEl.checked = true;
        }
    } catch (_) { /* storage unavailable */ }

    /* ── Initial view ───────────────────────────────────────────── */
    showView(mode === 'register' ? 'register' : 'login');

    /* ── Navigation links ───────────────────────────────────────── */
    function bindNavLink(id, viewName, url) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', function (e) {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            showView(viewName);
            history.replaceState({}, '', url);
        });
    }
    bindNavLink('toRegister', 'register', '/register');
    bindNavLink('toLogin',    'login',    '/login');

    const forgotTrigger = document.getElementById('forgotTrigger');
    if (forgotTrigger) {
        forgotTrigger.addEventListener('click', function () {
            showView('forgot');
        });
    }

    const backToLogin = document.getElementById('backToLogin');
    if (backToLogin) {
        backToLogin.addEventListener('click', function () {
            showView('login');
            history.replaceState({}, '', '/login');
        });
    }

    /* ── Login form ─────────────────────────────────────────────── */
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const email    = (document.getElementById('loginEmail') || {}).value.trim();
            const password = (document.getElementById('loginPassword') || {}).value;
            const remember = document.getElementById('rememberMe');
            const btn      = document.getElementById('signInBtn');

            if (!isValidEmail(email)) {
                setStatus('loginStatus', 'Please enter a valid email address.', 'is-error');
                return;
            }
            if (!password || password.length < 6) {
                setStatus('loginStatus', 'Password must be at least 6 characters.', 'is-error');
                return;
            }

            /* Save / clear remember */
            try {
                if (remember && remember.checked) {
                    localStorage.setItem(REMEMBER_KEY, email);
                } else {
                    localStorage.removeItem(REMEMBER_KEY);
                }
            } catch (_) { /* ignore */ }

            if (btn) btn.classList.add('is-loading');
            setStatus('loginStatus', 'Signing you in… taking you to U Map.', 'is-ok');

            setTimeout(function () {
                window.location.href = '/app';
            }, 750);
        });
    }

    /* ── Register form ──────────────────────────────────────────── */
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const name     = (document.getElementById('registerName') || {}).value.trim();
            const email    = (document.getElementById('registerEmail') || {}).value.trim();
            const password = (document.getElementById('registerPassword') || {}).value;

            if (name.length < 2) {
                setStatus('registerStatus', 'Please enter your full name.', 'is-error');
                return;
            }
            if (!isValidEmail(email)) {
                setStatus('registerStatus', 'Please enter a valid email address.', 'is-error');
                return;
            }
            if (!password || password.length < 6) {
                setStatus('registerStatus', 'Password must be at least 6 characters.', 'is-error');
                return;
            }

            setStatus('registerStatus', 'Account created! Opening U Map…', 'is-ok');
            setTimeout(function () {
                window.location.href = '/app';
            }, 750);
        });
    }

    /* ── Forgot password form ───────────────────────────────────── */
    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
        forgotForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const email = (document.getElementById('forgotEmail') || {}).value.trim();
            if (!isValidEmail(email)) {
                setStatus('forgotStatus', 'Enter the email on your account.', 'is-error');
                return;
            }
            setStatus('forgotStatus', 'If this email is registered, reset instructions are on their way.', 'is-ok');
        });
    }

    /* ── GSI load timeout — show fallback if GSI never loads ─────── */
    var gsiLoadTimeout = setTimeout(function () {
        var gsiWrap = document.getElementById('googleSignInWrap');
        var fallback = document.getElementById('googleFallbackMsg');
        // If the GSI div rendered an iframe, we're fine — otherwise show fallback
        if (gsiWrap && !gsiWrap.querySelector('iframe')) {
            if (fallback) fallback.hidden = false;
        }
    }, 5000);

    /* ── Google Identity Services callback ──────────────────────── */
    /**
     * Called by GSI library after the user picks a Google account.
     * Receives a CredentialResponse object with a signed JWT `credential`.
     * We POST it to our Flask backend for secure server-side verification.
     */
    window.handleGoogleCredential = function (response) {
        clearTimeout(gsiLoadTimeout);

        if (!response || !response.credential) {
            setStatus('googleStatus', 'Google Sign-In cancelled or failed. Please try again.', 'is-error');
            return;
        }

        // Show loading state
        setStatus('googleStatus', 'Verifying your Google account…', 'is-ok');

        fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data.success) {
                /* ── Success: show welcome message then redirect ─── */
                var welcomeMsg = data.message || ('Welcome, ' + (data.name || data.email) + '!');
                setStatus('googleStatus', '✓ ' + welcomeMsg + ' Redirecting…', 'is-ok');

                /* Show user's name/email in the heading for a nice touch */
                if (heading && data.name) {
                    heading.textContent = 'Welcome, ' + data.name.split(' ')[0] + '!';
                }

                setTimeout(function () {
                    window.location.href = '/app';
                }, 900);
            } else {
                /* ── Server-side error ─────────────────────────────── */
                var errMsg = data.error || 'Google Sign-In failed. Please try again.';
                setStatus('googleStatus', errMsg, 'is-error');
            }
        })
        .catch(function (err) {
            console.error('Google auth fetch error:', err);
            setStatus('googleStatus', 'Network error during Google Sign-In. Please check your connection and try again.', 'is-error');
        });
    };

}());
