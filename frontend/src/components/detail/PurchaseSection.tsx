"use client";

import Unit from "@/components/ui/Unit";
import SectionIcon from "@/components/ui/SectionIcon";
import DataTable from "@/components/library/DataTable";
import MoneyText from "@/components/ui/Money";
import { Button } from "@/components/ui/Field";
import type { DetailDialog } from "@/components/detail/detailDialog";
import { ACQUISITION_METHOD_LABEL } from "@/lib/labels";
import type { Acquisition } from "@/lib/types";

export default function PurchaseSection({
  acquisitions,
  onOpen,
}: {
  acquisitions: Acquisition[];
  onOpen: (dialog: DetailDialog) => void;
}) {
  return (
    <section>
      <h3 className="mb-4 flex items-center justify-between gap-3 text-base font-medium text-white/90 sm:text-lg">
        <span className="flex items-center gap-2">
          <SectionIcon name="purchase" />
          Purchase History
        </span>
        <span className="flex items-center gap-3">
          <span className="num text-xs text-white/30">
              {acquisitions.length}
              <Unit space>records</Unit>
            </span>
          <Button onClick={() => onOpen({ kind: "acquisition", item: null })}>
            기록 추가
          </Button>
        </span>
      </h3>
      <DataTable
        headers={["Method", "Price", "Date", "Store", "Label"]}
        empty={acquisitions.length === 0 ? "등록된 취득 기록이 없습니다" : undefined}
      >
        {acquisitions.map((item) => (
          <tr
            key={item.acquisitionId}
            onClick={() => onOpen({ kind: "acquisition", item })}
            className="cursor-pointer transition-colors hover:bg-white/[0.05]"
          >
            <td className="px-4 py-3 text-white/90">
              {ACQUISITION_METHOD_LABEL[item.method]}
            </td>
            <td className="num px-4 py-3 text-white/60">
              <MoneyText money={item.price} />
            </td>
            <td className="num px-4 py-3 text-white/60">{item.acquiredOn ?? "—"}</td>
            <td className="px-4 py-3 text-white/60">
              {item.subscription?.serviceName ?? item.platform?.name ?? "—"}
            </td>
            <td className="px-4 py-3 text-white/50">{item.label ?? "—"}</td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
