import { NextResponse } from "next/server";
import { IapPlatform, getIapCatalog } from "@/lib/iap/catalog";
import { getIapCatalogForPlatform } from "@/lib/server/iap";

function normalizePlatform(value: string | null): IapPlatform | null {
  if (value === "ios" || value === "android") return value;
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = normalizePlatform(url.searchParams.get("platform"));

  if (platform) {
    return NextResponse.json({
      ok: true,
      platform,
      products: getIapCatalogForPlatform(platform),
    });
  }

  const products = getIapCatalog().map((item) => ({
    key: item.key,
    type: item.type,
    title: item.title,
    iosProductId: item.iosProductId,
    androidProductId: item.androidProductId,
  }));

  return NextResponse.json({
    ok: true,
    products,
  });
}
