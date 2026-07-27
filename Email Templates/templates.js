function accountVerificationTemplate({ firstName, otp }) {
    return `
<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your Ariome account</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.07);">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 28px;color:#ffffff;">
              <h1 style="margin:0;font-size:22px;font-weight:700;">Ariome Account Verification</h1>
              <p style="margin:8px 0 0;font-size:14px;opacity:.95;">Use this one-time code to verify your email address.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;font-size:15px;">Hi ${firstName || 'there'},</p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;">
                Thanks for creating your Ariome account. Enter the OTP below to complete your email verification.
              </p>
              <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:20px;text-align:center;">
                <div style="font-size:13px;color:#64748b;letter-spacing:.06em;text-transform:uppercase;">Your OTP code</div>
                <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#0f172a;margin-top:8px;">${otp}</div>
                <div style="font-size:12px;color:#64748b;margin-top:10px;">Valid for 10 minutes</div>
              </div>
              <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
                If you did not sign up for Ariome, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function forgotPasswordOtpTemplate({ firstName, otp }) {
    return `
<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your Ariome password</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.07);">
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:24px 28px;color:#ffffff;">
              <h1 style="margin:0;font-size:22px;font-weight:700;">Ariome Password Reset</h1>
              <p style="margin:8px 0 0;font-size:14px;opacity:.95;">Use this one-time code to reset your password.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;font-size:15px;">Hi ${firstName || 'there'},</p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;">
                We received a request to reset your Ariome account password. Enter this OTP to continue.
              </p>
              <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:20px;text-align:center;">
                <div style="font-size:13px;color:#64748b;letter-spacing:.06em;text-transform:uppercase;">Password reset OTP</div>
                <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#0f172a;margin-top:8px;">${otp}</div>
                <div style="font-size:12px;color:#64748b;margin-top:10px;">Valid for 10 minutes</div>
              </div>
              <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
                If you did not request a password reset, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { accountVerificationTemplate, forgotPasswordOtpTemplate };
