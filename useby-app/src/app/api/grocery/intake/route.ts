import { NextResponse } from "next/server";

import { resolveDemoActorContext } from "@/server/demo/context";
import {
  groceryFileIntakeSchema,
  runGroceryFileIntake,
} from "@/server/grocery/intake";
import { isGroceryRuntimeError } from "@/server/grocery/runtime";

export const dynamic = "force-dynamic";

function validationResponse(error: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: "Invalid grocery intake payload.",
      details: error,
    },
    { status: 400 },
  );
}

function formValue(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function requestBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const bytes =
      file instanceof File
        ? Buffer.from(await file.arrayBuffer()).toString("base64")
        : null;

    return {
      kind: formValue(form, "kind"),
      fileName: file instanceof File ? file.name : formValue(form, "fileName"),
      contentType: file instanceof File ? file.type || "application/octet-stream" : formValue(form, "contentType"),
      contentBase64: bytes,
      rawText: formValue(form, "rawText"),
      parse: formValue(form, "parse") !== "false",
      apply: formValue(form, "apply") === "true",
      allowFixture: formValue(form, "allowFixture") !== "false",
      itemId: formValue(form, "itemId"),
      idempotencyKey: formValue(form, "idempotencyKey"),
    };
  }

  return request.json();
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/grocery/intake",
    method: "POST",
    access: "server-mediated private S3 upload when configured; responses return file IDs and statuses, not public bucket URLs.",
    noKeyBehavior:
      "Missing S3/Textract configuration returns upload_unavailable or labelled fixture/unavailable parse states.",
    body: {
      kind: "receipt | expiry_label",
      contentBase64: "base64 file bytes, or use multipart field file",
      rawText: "optional OCR fixture/dry-run text",
      parse: "boolean, defaults true",
      apply: "boolean, defaults false",
      itemId: "required when applying expiry_label",
      allowFixture: "boolean, defaults true",
      idempotencyKey: "optional stable key",
    },
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const contextResult = await resolveDemoActorContext({
    headers: request.headers,
    searchParams: url.searchParams,
  });

  if (!contextResult.ok) {
    return NextResponse.json(
      { ok: false, error: contextResult.message },
      { status: contextResult.status },
    );
  }

  let json: unknown;
  try {
    json = await requestBody(request);
  } catch {
    return validationResponse("Request body must be JSON or multipart/form-data.");
  }

  const parsed = groceryFileIntakeSchema.safeParse(json);
  if (!parsed.success) {
    return validationResponse(parsed.error.flatten());
  }

  try {
    const response = await runGroceryFileIntake(contextResult.context, parsed.data);
    return NextResponse.json(response, { status: response.idempotent ? 200 : 201 });
  } catch (error) {
    if (isGroceryRuntimeError(error)) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Grocery intake failed.",
      },
      { status: 500 },
    );
  }
}
