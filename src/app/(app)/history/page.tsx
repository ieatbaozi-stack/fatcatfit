import { getTranslations } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui/empty-state";

export default async function HistoryPage() {
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("nav.history")} />
      <EmptyState pose="peek">{t("empty.history")}</EmptyState>
    </>
  );
}
