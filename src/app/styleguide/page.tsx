import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StyleguideBody } from "@/components/styleguide/styleguide-body";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("styleguide");
  return { title: t("title"), robots: { index: false } };
}

export default function StyleguidePage() {
  return <StyleguideBody />;
}
