import { describe, expect, it, vi } from "vitest";
import ky from "ky";
import { uploadErrorMessage, uploadImage } from "./upload-client";

const { postMock, httpErrorClass } = vi.hoisted(() => {
  class HTTPError extends Error {
    constructor(public response: Response) {
      super("http error");
    }
  }
  return { postMock: vi.fn(), httpErrorClass: HTTPError };
});

vi.mock("ky", () => ({ default: { post: postMock }, HTTPError: httpErrorClass }));

/** Mirrors ky's thenable response: a promise with .json() attached synchronously. */
function kyResponse(data: unknown): Promise<unknown> & { json: () => Promise<unknown> } {
  return Object.assign(Promise.resolve(undefined), { json: async () => data });
}

describe("uploadImage", () => {
  it("posts multipart with file and role and parses the response", async () => {
    postMock.mockReturnValue(
      kyResponse({ url: "/api/files/a.png", width: 800, height: 1000 }),
    );

    const file = new File([new Uint8Array([1, 2])], "p.png", { type: "image/png" });
    const result = await uploadImage(file, "person");

    expect(result).toStrictEqual({ url: "/api/files/a.png", width: 800, height: 1000 });
    const [url, init] = (ky.post as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { body: FormData },
    ];
    expect(url).toBe("/api/upload");
    expect(init.body.get("role")).toBe("person");
    expect(init.body.get("file")).toBe(file);
  });
});

describe("uploadErrorMessage", () => {
  it("extracts the server reason from an HTTPError", async () => {
    const error = new httpErrorClass(
      new Response(JSON.stringify({ error: "p.png: not a decodable image" }), {
        status: 422,
      }),
    );

    await expect(uploadErrorMessage(error)).resolves.toBe("p.png: not a decodable image");
  });

  it("falls back when the body is unparsable", async () => {
    const error = new httpErrorClass(new Response("gateway noise", { status: 502 }));

    await expect(uploadErrorMessage(error)).resolves.toBe("upload failed");
  });
});
