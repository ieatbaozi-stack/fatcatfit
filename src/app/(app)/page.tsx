import { getTranslations } from "next-intl/server";
import { PlaceChip } from "@/components/places/place-chip";
import { EmptyState, PageHeader } from "@/components/ui/empty-state";
import { HandWord } from "@/components/ui/hand-word";

export default async function HomePage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("nav.home")} eyebrow={<HandWord className="text-section">{t("app.name")}</HandWord>} />
      <EmptyState pose="lying">{t("empty.home")}</EmptyState>
      <PlaceChip />
    </>
  );
}
