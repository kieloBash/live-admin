import nodemailer from "nodemailer";

// Gmail SMTP with an App Password (not your normal Gmail password).
// Create one: Google Account -> Security -> 2-Step Verification -> App passwords
// Env vars:
//   GMAIL_USER=you@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
//   REPORT_RECIPIENTS=admin1@x.com,admin2@x.com

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.GMAIL_USER,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    },
  });
  return transporter;
}

export async function sendReportEmail(opts: {
  subject: string;
  html: string;
  filename: string;
  attachment: Buffer;
  to?: string[];
}) {
  const recipients =
    opts.to ??
    (process.env.REPORT_RECIPIENTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  if (recipients.length === 0) {
    throw new Error("No recipients configured (set REPORT_RECIPIENTS).");
  }

  const info = await getTransporter().sendMail({
    from: `Live Admin Reports <${process.env.GMAIL_USER}>`,
    to: recipients.join(", "),
    subject: opts.subject,
    html: opts.html,
    attachments: [
      {
        filename: opts.filename,
        content: opts.attachment,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });

  return { messageId: info.messageId, recipients };
}
