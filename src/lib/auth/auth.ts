import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization } from "better-auth/plugins/organization";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema } from "@/lib/db";
import { env, isProd } from "@/env";
import { sendMail } from "@/lib/email";

function buildAuth(db: Awaited<ReturnType<typeof getDb>>) {
  return betterAuth({
    appName: "Vastra Studio",
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
      },
    }),
    emailAndPassword: { enabled: false },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh once a day
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: { enabled: true, window: 60, max: 40 },
    advanced: {
      cookiePrefix: "vastra",
      useSecureCookies: isProd,
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 5,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          const subject = type === "sign-in" ? "Your Vastra Studio sign-in code" : "Your Vastra Studio verification code";
          await sendMail({
            to: email,
            subject,
            text: `Your code is ${otp}. It expires in 5 minutes. If you did not request it, ignore this email.`,
            html: `<p style="font-family:Georgia,serif;font-size:16px">Your Vastra Studio code is</p><p style="font-family:monospace;font-size:28px;letter-spacing:6px">${otp}</p><p style="color:#666;font-size:13px">It expires in 5 minutes. If you did not request it, you can ignore this email.</p>`,
          });
        },
      }),
      organization({
        allowUserToCreateOrganization: true,
        organizationLimit: 3,
        creatorRole: "owner",
        membershipLimit: 25,
        async sendInvitationEmail(data) {
          const link = `${env.APP_URL}/invite/${data.id}`;
          await sendMail({
            to: data.email,
            subject: `${data.inviter.user.name} invited you to ${data.organization.name} on Vastra Studio`,
            text: `Accept the invitation: ${link}`,
            html: `<p style="font-family:Georgia,serif">${data.inviter.user.name} invited you to <b>${data.organization.name}</b> on Vastra Studio.</p><p><a href="${link}">Accept the invitation</a></p>`,
          });
        },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;

declare global {
   
  var __vastraAuth: Promise<Auth> | undefined;
}

export function getAuth(): Promise<Auth> {
  if (!globalThis.__vastraAuth) {
    globalThis.__vastraAuth = getDb().then(buildAuth);
  }
  return globalThis.__vastraAuth;
}
