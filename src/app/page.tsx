//import fixture from "../../fixtures/debtor-standard.json";
import { getAccount } from "@/lib/account/service";
import { DebtorPortal } from "@/components/debtor-portal";

export const dynamic = "force-dynamic";

export default async function Home() {
  const liveAccount = await getAccount("acc_standard_001")

  const legacyFixtureData = {
    ...liveAccount,
    account: {
      ...liveAccount.account,
      debtorFirstName: liveAccount.account.accountHolderFirstName,
      debtorLastName: liveAccount.account.accountHolderLastName,
      // Keep other fields on the account holder object intact
    },
    promisesToPay: liveAccount.promisesToPay,
    transactions: liveAccount.transactions,
    callAppointments: liveAccount.callAppointments,
    notificationRules: liveAccount.notificationRules,
  };
  return <DebtorPortal fixture={legacyFixtureData as any} />;
}
