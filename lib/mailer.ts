import nodemailer, { type Transporter, type SendMailOptions } from "nodemailer";
import { OAuth2Client } from "google-auth-library";

// Reuse across hot reloads (dev) / lambda invocations
declare global {
    // eslint-disable-next-line no-var
    var _oauth2Client: OAuth2Client | undefined;
}

function getOAuth2Client(): OAuth2Client {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } =
        process.env;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
        throw new Error(
            "Missing Gmail OAuth config. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN."
        );
    }

    const client = new OAuth2Client(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground" // redirect URI used to mint the refresh token
    );
    client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
    return client;
}

const oauth2Client: OAuth2Client = global._oauth2Client ?? getOAuth2Client();

if (process.env.NODE_ENV !== "production") {
    global._oauth2Client = oauth2Client;
}

/**
 * Builds a transporter with a fresh access token.
 * Access tokens expire (~1h); google-auth-library auto-refreshes using the
 * refresh token, so we fetch one per send (cheap — it's cached internally).
 */
async function createTransporter(): Promise<Transporter> {
    const { token } = await oauth2Client.getAccessToken();
    if (!token) {
        throw new Error("Failed to obtain Gmail access token");
    }

    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            type: "OAuth2",
            user: process.env.GMAIL_USER!,
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            refreshToken: process.env.GOOGLE_REFRESH_TOKEN!,
            accessToken: token,
        },
    });
}

export type SendMailArgs = {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
    cc?: string | string[];
    bcc?: string | string[];
    attachments?: SendMailOptions["attachments"];
};

export async function sendMail({
    to,
    subject,
    html,
    text,
    from,
    replyTo,
    cc,
    bcc,
    attachments,
}: SendMailArgs) {
    // from must match GMAIL_USER (or a verified send-as alias) or Gmail rewrites it
    const fromAddress =
        from ?? `"${process.env.SMTP_FROM_NAME ?? "MarineGo"}" <${process.env.GMAIL_USER}>`;

    const transporter = await createTransporter();

    const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
        text,
        replyTo,
        cc,
        bcc,
        attachments,
    });

    return info;
}

/** Optional: verify the connection (useful in a health check). */
export async function verifyMailer(): Promise<boolean> {
    try {
        const transporter = await createTransporter();
        await transporter.verify();
        return true;
    } catch {
        return false;
    }
}