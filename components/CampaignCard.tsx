export default function CampaignCard({ campaign }: any) {
  return (
    <div className="border rounded-xl p-4 shadow-sm">
      <h2 className="font-semibold text-lg">{campaign.title}</h2>
      <p className="text-sm text-gray-500">{campaign.business}</p>

      <div className="flex justify-between mt-2">
        <span>${campaign.pay}</span>
        <span>{campaign.tier}</span>
      </div>

      <div className="mt-2 text-sm">
        Slots: {campaign.remaining}/{campaign.slots}
      </div>

      <button className="mt-3 w-full bg-black text-white py-2 rounded">
        Claim Spot
      </button>
    </div>
  );
}
