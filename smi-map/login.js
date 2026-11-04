// Login screen behaviour: Supabase email + password, SMI students only.
import { supabase, ALLOWED_DOMAIN } from './supabase.js';

const form = document.getElementById('loginForm');
const email = document.getElementById('email');
const password = document.getElementById('password');
const doors = document.getElementById('doors');
const message = document.getElementById('message');
const togglePw = document.getElementById('togglePw');
const title = document.getElementById('title');
const switchMode = document.getElementById('switchMode');

const MAP_URL = new URL('stations.html', location.href).href;
let mode = 'login'; // or 'signup'

// Already logged in → go straight to the map. A reset link lands here to pick a new password.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') setTimeout(resetPassword);
  else if (event === 'INITIAL_SESSION' && session && !location.hash.includes('type=recovery')) location.replace(MAP_URL);
});

// Start with the email field filled blue, as in the sketch, until something else is focused.
const emailField = email.closest('.field');
emailField.classList.add('is-active');
form.addEventListener('focusin', () => emailField.classList.remove('is-active'), { once: true });

togglePw.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  togglePw.setAttribute('aria-pressed', String(show));
  togglePw.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

switchMode.addEventListener('click', (e) => {
  e.preventDefault();
  mode = mode === 'login' ? 'signup' : 'login';
  title.textContent = mode === 'login' ? 'Login' : 'Join';
  switchMode.textContent = mode === 'login' ? 'New here? Join' : 'Have an account? Login';
  password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  showMessage('');
});

document.getElementById('forgot').addEventListener('click', async (e) => {
  e.preventDefault();
  const emailValue = email.value.trim().toLowerCase();
  if (!isStudentEmail(emailValue)) return fail(`Type your ${ALLOWED_DOMAIN} email first.`, email);
  const { error } = await supabase.auth.resetPasswordForEmail(emailValue, { redirectTo: location.href.split('#')[0] });
  if (error) return fail(describeError(error));
  showMessage('Check your inbox for a reset link.', true);
});

async function resetPassword() {
  const newPassword = window.prompt('Choose a new password (at least 6 characters):');
  if (!newPassword) return;
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return fail(describeError(error));
  location.replace(MAP_URL);
}

function isStudentEmail(value) {
  return email.checkValidity() && value.endsWith(ALLOWED_DOMAIN);
}

// Supabase sometimes returns an empty message ("{}"), e.g. when sending the email times out.
function describeError(error) {
  console.error('Supabase auth error:', error);
  const msg = error.message && error.message !== '{}' ? error.message : '';
  if (/sending|smtp|email/i.test(msg) || error.status === 504 || (!msg && error.status >= 500)) {
    return `Couldn't send the email (server error ${error.status ?? '?'}). Check the SMTP settings in Supabase.`;
  }
  if (/database error/i.test(msg)) return `Database rejected the account: ${msg}`;
  if (/rate limit/i.test(msg)) return 'Too many emails sent. Wait a bit and try again.';
  return msg || `Something went wrong (${error.name ?? 'error'} ${error.status ?? ''}).`;
}

function showMessage(text, ok = false) {
  message.textContent = text;
  message.classList.toggle('ok', ok);
}

function fail(text, field) {
  showMessage(text);
  document.querySelectorAll('.field').forEach(f => f.classList.remove('has-error'));
  field?.closest('.field').classList.add('has-error');
  doors.classList.remove('is-shaking');
  void doors.offsetWidth; // restart animation
  doors.classList.add('is-shaking');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const emailValue = email.value.trim().toLowerCase();

  if (!emailValue) return fail('Enter your student email.', email);
  if (!isStudentEmail(emailValue)) return fail(`Use your ${ALLOWED_DOMAIN} email.`, email);
  if (password.value.length < 6) return fail('Password needs at least 6 characters.', password);

  document.querySelectorAll('.field').forEach(f => f.classList.remove('has-error'));
  doors.disabled = true;
  showMessage(mode === 'login' ? 'Knocking…' : 'Making your key…', true);

  try {
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: emailValue,
        password: password.value,
        options: { emailRedirectTo: MAP_URL },
      });
      if (error) return fail(describeError(error));
      // Supabase returns a user with no identities when the email is already registered.
      if (data.user && data.user.identities?.length === 0) return fail('That email already has an account. Log in instead.', email);
      if (!data.session) return showMessage('Almost there! Confirm the link in your student inbox, then log in.', true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: emailValue, password: password.value });
      if (error) {
        if (/confirm/i.test(error.message)) return fail('Confirm the link in your inbox first.', email);
        return fail('That email or password is wrong.', password);
      }
    }

    showMessage('Doors open — heading to the map…', true);
    doors.classList.add('is-open');
    setTimeout(() => location.replace(MAP_URL), 1100);
  } finally {
    doors.disabled = false;
  }
});
