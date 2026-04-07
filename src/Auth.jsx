import { useState } from "react";
import { supabase } from "./supabaseClient";

const css = `
.auth-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f4ff;
  padding: 24px;
  font-family: system-ui, -apple-system, sans-serif;
}
.auth-card {
  background: #fff;
  border: 1px solid #c8d4f5;
  border-radius: 10px;
  padding: 40px 32px;
  max-width: 380px;
  width: 100%;
  box-shadow: 0 4px 24px rgba(0,51,153,0.08);
}
.auth-logo { font-size: 36px; text-align: center; margin-bottom: 12px; }
.auth-title {
  font-size: 22px;
  font-weight: 800;
  color: #003399;
  text-align: center;
  margin-bottom: 24px;
}
.auth-field { margin-bottom: 14px; }
.auth-field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #444;
  margin-bottom: 4px;
}
.auth-field input {
  width: 100%;
  border: 1px solid #bbb;
  border-radius: 4px;
  padding: 10px 12px;
  font-size: 15px;
  font-family: inherit;
  outline: none;
}
.auth-field input:focus {
  border-color: #003399;
  box-shadow: 0 0 0 2px #003399aa;
}
.auth-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  background: #003399;
  color: #fff;
  margin-top: 8px;
}
.auth-btn:hover { background: #0044cc; }
.auth-btn:disabled { opacity: 0.6; cursor: default; }
.auth-toggle {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: #666;
}
.auth-toggle button {
  background: none;
  border: none;
  color: #003399;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  text-decoration: underline;
}
.auth-error {
  background: #f8d7da;
  border: 1px solid #dc3545;
  color: #721c24;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 12px;
}
.auth-success {
  background: #d4edda;
  border: 1px solid #28a745;
  color: #155724;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 12px;
}
`;

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (isSignUp) {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) setError(err.message);
      else setSuccess("Check your email to confirm your account.");
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    }
    setLoading(false);
  }

  return (
    <>
      <style>{css}</style>
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">🧠</div>
          <div className="auth-title">{isSignUp ? "Create Account" : "Sign In"}</div>
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}
          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </div>
            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? "..." : isSignUp ? "Sign Up" : "Sign In"}
            </button>
          </form>
          <div className="auth-toggle">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button onClick={() => { setIsSignUp(!isSignUp); setError(""); setSuccess(""); }}>
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
