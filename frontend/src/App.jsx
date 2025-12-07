import { useState } from "react";
import "./App.css";

export default function App() {
  const [mobile, setMobile] = useState("");
  const [requestId, setRequestId] = useState(null);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("mobile");
  const [error, setError] = useState("");

  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);

  const sendOtp = async () => {
    if (!isValidMobile) {
      setError("Invalid mobile number");
      return;
    }
    setError("");

    const res = await fetch("http://localhost:8000/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.detail);
      return;
    }

    setRequestId(data.request_id);
    setStep("otp");
  };

  const verifyOtp = async () => {
    const res = await fetch("http://localhost:8000/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId, mobile, otp }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.detail);
      return;
    }

    alert("OTP Verified!");
  };

  return (
    <div className="screen">
      <div className="card">
        <h2>Get started with OurNest</h2>

        {step === "mobile" && (
          <>
            <input
              placeholder="Enter mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />
            <button disabled={!isValidMobile} onClick={sendOtp}>
              Send OTP
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <p>OTP sent to +91 {mobile}</p>
            <input
              placeholder="Enter 4-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <button disabled={otp.length !== 4} onClick={verifyOtp}>
              Verify OTP
            </button>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
