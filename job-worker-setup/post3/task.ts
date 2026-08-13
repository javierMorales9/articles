class Job {
    campaignId: string;
    constructor(campaignId: string) {
        this.campaignId = campaignId;
    }

    static fromGraphilePayload(payload: any): Job {
        return new Job(payload.campaignId);
    }
}
type Db = {
    transaction: (prop: (tx: Db) => void) => {}
};


class Recipient {
    private name: string;
    private surname: string;
    private address: string;
    private postalCode: string;
    private city: string;
    private region: string;
    private country: string;

    private validated: boolean;

    constructor({ 
        address,
        postalCode,
        //... rest of fields
     }: {
        address: string,
        postalCode: string,
        //... rest of address fields
    }) {
        this.validated = false;

        this.address = address;
        this.postalCode = postalCode;
        //Initialize rest of the fields from parameters
    }

    validate({ 
        address,
        postalCode,
        //... rest of address related fields
     }: {
        //... rest of adddress realted fields
    }) {
        this.validated = true;

        this.address = address;
        this.postalCode = postalCode;
        //...Rest of fields
    }
};

class Campaign {
  constructor(
    public id: string,
    public status: "validating" | "ready" | "failed",
    public total: number,
    public error: number,
    public validated: number,
    //...other fields
  ) {}


  recipientValidationFailed() {
    this.error += 1;
  }

  finishValidation() {
    this.status = "ready";
  }
}

class RecipientRepository {
    db: Db;

    constructor(db: Db) {
        this.db = db;
    }
    
    setDb(db: Db) {
        this.db = db;
    }

    getCardsToValidate(campaignId: string, chunkSize: number): Recipient[] {
        return []; 
    }

    save(rec: Recipient) {}

    updateMultiple(recps: Recipient[]) {

    }
}

class CampaignRepository {
    db: Db;

    constructor(db: Db) {
        this.db = db;
    }

    setDb(db: Db) {
        this.db = db;
    }

    find(campaignId: string) {
        return new Campaign(
            campaignId,
            "validating",
            56,
            0,
            0,
        );
    }

    save(campaign: Campaign) {

    }
}

function validateAddressWitGoogle(car: Recipient) {
    return car;
}

const CHUNK_SIZE = process.env.WORKER_CHUNK_SIZE ?? 50;

export async function validateCardsTask(payload: unknown, db: Db): Promise<void> {
  const job = Job.fromGraphilePayload(payload);

  if (!job.campaignId) {
    throw new Error("validate_cards job missing campaignId");
  }

  const recipientRepo = new RecipientRepository(db);
  const campaignRepo = new CampaignRepository(db);

  const campaign = campaignRepo.find(job.campaignId);

  while (true) {
    const recipientsBatch = await recipientRepo.getCardsToValidate(
      job.campaignId,
      CHUNK_SIZE,
    );

    if (recipientsBatch.length === 0) {
      break;
    }

    for (const rec of recipientsBatch) {
      const realFields = await validateAddressWitGoogle(rec);
      rec.validate(realFields);
    }
  }
  
  await db.transaction(async (tx) => {
    recipientRepo.setDb(tx);
    await recipientRepo.updateMultiple(recipientsBatch);

    campaign.finishValidation();
    await campaignRepo.save(campaign);
  });
}