import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, NextFetchEvent } from "next/server";
import type { NextRequest } from "next/server";

export default async function middleware(
  req: NextRequest,
  evt: NextFetchEvent,
) {
  const country = req.geo?.country;
  // Check for Russian traffic first as there's too much spam from Russia
  if (country === "RU") {
    return new NextResponse("Access Denied", { status: 403 });
  }

  // If not from Russia, proceed with Clerk authentication.
  // Dev fallback: with no Clerk key set, skip auth so the app renders.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return NextResponse.next();
  }
  return clerkMiddleware()(req, evt);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
