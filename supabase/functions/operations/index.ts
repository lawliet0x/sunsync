import { BodyTooLarge, readJsonBody } from "./request-body.js";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((x) => x.trim());
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  if (origin && !allowed.includes(origin))
    return new Response(JSON.stringify({ error: "Origin not permitted" }), {
      status: 403,
      headers,
    });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers,
    });
  const token = req.headers.get("authorization");
  if (!token?.startsWith("Bearer "))
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers,
    });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: token } },
      auth: { persistSession: false },
    },
  );
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser(token.slice(7));
  if (authError || !user)
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers,
    });
  try {
    const body = await readJsonBody(req);
    const operations: Record<string, string[]> = {
      ingest_reading: [
        "device",
        "start_at",
        "end_at",
        "kwh",
        "provenance",
        "external_id",
        "correction",
      ],
      import_meter_readings: ["society", "records"],
      process_allocation: ["society", "start_at", "end_at"],
      review_registration: ["request_id", "approve", "note"],
      add_member: ["society", "building", "resident", "home"],
      manage_access: ["society", "target_user", "action"],
    };
    const fields = operations[body.operation];
    if (
      !fields ||
      !body.args ||
      typeof body.args !== "object" ||
      Array.isArray(body.args) ||
      Object.keys(body.args).some((x) => !fields.includes(x))
    )
      throw new Error("Invalid operation");
    const { data, error } = await db.rpc(body.operation, body.args);
    if (error) {
      // Known, deliberately authored business failures are safe; SQL/internal errors are not.
      const safe =
        error.code === "P0001"
          ? error.message
          : "Operation failed. Check input, permissions, and duplicate records.";
      console.warn(
        JSON.stringify({
          event: "operation_failed",
          operation: body.operation,
          code: error.code,
          user: user.id,
        }),
      );
      return new Response(JSON.stringify({ error: safe }), {
        status: error.message === "Forbidden" ? 403 : 400,
        headers,
      });
    }
    return new Response(JSON.stringify({ data }), { status: 200, headers });
  } catch (error) {
    if (error instanceof BodyTooLarge)
      return new Response(JSON.stringify({ error: "Request too large" }), {
        status: 413,
        headers,
      });
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers,
    });
  }
});
