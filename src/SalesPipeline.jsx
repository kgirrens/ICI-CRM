import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase, getUserId } from "./supabaseStorage";

// ──────────────────────────────────────────────────────────────────────────
// ICI Insurance — Sales Pipeline + Contacts
// Tab 1: Six-stage drag-and-drop deal board.
// Tab 2: Contacts directory with activity logging.
// Shared persistent storage across sessions.
// ──────────────────────────────────────────────────────────────────────────

const STAGES = [
  { id: "prospecting", label: "Prospecting", hint: "Identified, not yet contacted" },
  { id: "first_touch", label: "First Touch", hint: "Initial outreach made" },
  { id: "discovery", label: "Discovery", hint: "Understanding needs & risk" },
  { id: "proposal", label: "Proposal", hint: "Coverage & pricing presented" },
  { id: "negotiation", label: "Negotiation", hint: "Terms in discussion" },
  { id: "closed", label: "Closed", hint: "Won or lost" },
];

const LINES = [
  "Business Insurance",
  "Captive Insurance",
  "Cyber Insurance",
  "Employee Benefits",
  "360 Safety Program",
  "Personal Insurance",
];

const INDUSTRIES = [
  "Construction",
  "Healthcare",
  "Hospitality",
  "Manufacturing",
  "Nonprofit",
  "Oil & Gas",
  "Public Entity",
  "Trucking",
  "Other",
];

const ACCOUNT_STATUS = ["Prospect", "Client", "Former Client"];

const ACTIVITY_TYPES = [
  "Call",
  "Email",
  "Meeting",
  "Quote sent",
  "Proposal sent",
  "Left voicemail",
  "Renewal review",
  "Note",
];

const TASK_TYPES = ["Call", "Email", "Text", "Meeting", "Renewal review", "Other"];

// Days an open deal can sit with no activity before flagged as leakage risk.
const STALE_THRESHOLDS = {
  prospecting: 14,
  first_touch: 7,
  discovery: 10,
  proposal: 5,
  negotiation: 4,
};

const DEALS_KEY = "ici-pipeline-deals";
const CONTACTS_KEY = "ici-contacts";
const TASKS_KEY = "ici-tasks";
const ACCOUNTS_KEY = "ici-accounts";
const NEWBIZ_KEY = "ici-newbiz";
const EVENTS_KEY = "ici-events";

// ── New Business Application schema (mirrors the 4-page ICI form) ──
// Each section: title + fields. Field types: text, textarea, check (yes/no),
// choice (radio set), and "repeat" groups (autos, drivers, WC classes).
const NB_SECTIONS = [
  {
    id: "general", title: "General Info",
    fields: [
      { k: "effectiveDate", label: "Effective Date", type: "date" },
      { k: "needByDate", label: "Need By Date", type: "date" },
      { k: "producer", label: "Producer", type: "text" },
      { k: "firstNamedInsured", label: "First Named Insured", type: "text" },
      { k: "fein", label: "FEIN", type: "text" },
      { k: "mailingAddress", label: "Mailing Address", type: "text", wide: true },
      { k: "website", label: "Website", type: "text" },
      { k: "officePhone", label: "Office Phone", type: "text" },
      { k: "fax", label: "Fax", type: "text" },
      { k: "ownerNamePosition", label: "Owner Name & Position", type: "text", wide: true },
      { k: "ownerEmail", label: "Owner Email", type: "text" },
      { k: "ownerPhone", label: "Owner Phone", type: "text" },
      { k: "insContactNamePosition", label: "Insurance Contact Name & Position", type: "text", wide: true },
      { k: "insContactEmail", label: "Insurance Contact Email", type: "text" },
      { k: "insContactPhone", label: "Insurance Contact Phone", type: "text" },
      { k: "additionalNamedInsured", label: "Additional Named Insured(s)", type: "text" },
      { k: "additionalFein", label: "Additional FEIN", type: "text" },
      { k: "additionalRelationship", label: "Description/Relationship of Additional Named Insured(s)", type: "text", wide: true },
      { k: "commonOwnership", label: "Common Ownership?", type: "check" },
      { k: "entityType", label: "Entity Type", type: "choice", options: ["Individual/Sole Prop", "Corporation", "LLC", "Not for Profit"] },
      { k: "ownersOwnership", label: "Owners & Ownership %", type: "text" },
      { k: "yearsExperience", label: "Years' Experience", type: "text" },
      { k: "narrative", label: "Narrative of Operations", type: "textarea", wide: true },
    ],
  },
  {
    id: "property", title: "Property",
    note: "Attach ICS sheet from appraiser's website. Property values are pulled from the HQ county appraiser.",
    fields: [
      { k: "propOccupancy", label: "Occupancy", type: "choice", options: ["Owner Occupied", "Lessor's Risk", "Tenant"] },
      { k: "propLocationAddress", label: "Location Address", type: "text", wide: true },
      { k: "propConstructionType", label: "Construction Type", type: "text" },
      { k: "propStories", label: "Number of Stories", type: "text" },
      { k: "propCounty", label: "County", type: "text" },
      { k: "propYearBuilt", label: "Year Built", type: "text" },
      { k: "propSquareFt", label: "Square Ft", type: "text" },
      { k: "propSprinklered", label: "Sprinklered?", type: "check" },
      { k: "propAlarm", label: "Alarm?", type: "check" },
      { k: "propAopDeductible", label: "AOP Deductible", type: "text" },
      { k: "propWindHailDeductible", label: "Wind/Hail Deductible", type: "text" },
      { k: "propBuildingLimit", label: "Building Limit", type: "text" },
      { k: "propBppLimit", label: "BPP Limit", type: "text" },
      { k: "propBusinessIncomeLimit", label: "Business Income Limit", type: "text" },
      { k: "propElectric", label: "Updates — Electric", type: "text" },
      { k: "propPlumbing", label: "Updates — Plumbing", type: "text" },
      { k: "propRoof", label: "Updates — Roof", type: "text" },
      { k: "propHeating", label: "Updates — Heating", type: "text" },
      { k: "propRoofType", label: "Roof Type", type: "text" },
      { k: "propFlood", label: "Flood?", type: "check" },
      { k: "propEarthquake", label: "Earthquake?", type: "check" },
      { k: "propMortgagee", label: "Mortgagee", type: "text", wide: true },
      { k: "propAdditionalInsured", label: "Additional Insured(s)", type: "text", wide: true },
    ],
  },
  {
    id: "gl", title: "General Liability",
    fields: [
      { k: "glLimits", label: "Limits", type: "text" },
      { k: "glMedicalPaymentLimit", label: "Medical Payment Limit", type: "text" },
      { k: "glDeductible", label: "Deductible", type: "text" },
      { k: "glHiredNonOwned", label: "Hired & Non-Owned to be added", type: "check" },
      { k: "glAnnualSales", label: "Annual Sales", type: "text" },
      { k: "glAnnualPayroll", label: "Annual Payroll (excl Clerical & Sales)", type: "text" },
      { k: "glClassCodes", label: "Class Codes / Descriptions / Forms needed", type: "textarea", wide: true },
      { k: "glAdditionalInsured", label: "Additional Insured(s)", type: "text", wide: true },
      { k: "glEbl", label: "Employee Benefits Liability (EBL)", type: "check" },
    ],
  },
  {
    id: "auto", title: "Business Auto",
    fields: [
      { k: "autoScheduleAttached", label: "Current schedule attached?", type: "check" },
      { k: "autoLiabilityLimit", label: "Liability Limit", type: "text" },
      { k: "autoPip", label: "PIP", type: "text" },
      { k: "autoDeductibles", label: "Deductibles (Comp/Collision)", type: "text" },
    ],
    repeat: {
      k: "autos", label: "Vehicles", addLabel: "+ Add vehicle",
      cols: [
        { k: "year", label: "Year" }, { k: "make", label: "Make" }, { k: "model", label: "Model" },
        { k: "lienholder", label: "Lienholder" }, { k: "vin", label: "VIN" }, { k: "costNew", label: "Cost New" },
      ],
    },
  },
  {
    id: "drivers", title: "Drivers",
    note: "Attach schedule or complete below.",
    repeat: {
      k: "drivers", label: "Drivers", addLabel: "+ Add driver",
      cols: [
        { k: "name", label: "Name" }, { k: "dl", label: "DL #" }, { k: "state", label: "State" }, { k: "dob", label: "DOB" },
      ],
    },
  },
  {
    id: "wc", title: "Workers Compensation",
    repeat: {
      k: "wcClasses", label: "Class codes", addLabel: "+ Add class code",
      cols: [
        { k: "classCode", label: "Class Code" }, { k: "payroll", label: "Payroll" },
        { k: "ft", label: "# EE FT" }, { k: "pt", label: "# EE PT" },
      ],
    },
    fields: [
      { k: "wcOwners", label: "Owners", type: "choice", options: ["Included", "Excluded"] },
      { k: "wcOwnerClassCode", label: "If Included: Class Code", type: "text" },
      { k: "wcOwnerPayroll", label: "If Included: Payroll", type: "text" },
      { k: "wcExperienceMod", label: "Experience Mod", type: "text" },
      { k: "wcEmployersLiabilityLimit", label: "Employers Liability Limit", type: "text" },
      { k: "wcNotes", label: "Notes", type: "textarea", wide: true },
    ],
  },
  {
    id: "other", title: "Inland Marine / Umbrella / EPLI / Cyber",
    fields: [
      { k: "imCoverageLimit", label: "Inland Marine — Coverage/Limit", type: "text" },
      { k: "imDeductible", label: "Inland Marine — Deductible", type: "text" },
      { k: "imLeasedRentedLimit", label: "Leased/Rented Equipment Limit", type: "text" },
      { k: "umbrella", label: "Umbrella?", type: "check" },
      { k: "umbrellaLimit", label: "Umbrella — Limit", type: "text" },
      { k: "umbrellaDeductible", label: "Umbrella — Deductible", type: "text" },
      { k: "epli", label: "EPLI?", type: "check" },
      { k: "epliLimit", label: "EPLI — Limit", type: "text" },
      { k: "epliDeductible", label: "EPLI — Deductible", type: "text" },
      { k: "cyber", label: "Cyber?", type: "check" },
      { k: "cyberLimit", label: "Cyber — Limit", type: "text" },
      { k: "cyberDeductible", label: "Cyber — Deductible", type: "text" },
    ],
  },
  {
    id: "submission", title: "Submission",
    fields: [
      { k: "marketsToApproach", label: "Market(s) to Approach", type: "text", wide: true },
      { k: "targetPremium", label: "Target Premium", type: "text" },
      { k: "policyDelivery", label: "Policy Delivery", type: "choice", options: ["Producer", "Producer to Sign & Mail", "AM to Deliver", "AM to Email", "QM to Mail"] },
      { k: "dataCurrentPolicies", label: "Data — Copies of Current Policies", type: "check" },
      { k: "dataNcci", label: "Data — NCCI Experience Rating Worksheet", type: "check" },
      { k: "dataLossRuns", label: "Data — 5 Years of currently-valued loss runs", type: "check" },
      { k: "dataCertList", label: "Data — Customer Certificate List", type: "check" },
      { k: "specialInstructions", label: "Special Instructions", type: "textarea", wide: true },
    ],
  },
];

const seedAccounts = () => ([
  {
    id: "ac1",
    name: "Prairie Steel Fabricators",
    industry: "Construction",
    status: "Client",
    employees: 85,
    revenue: 12500000,
    renewal: "2027-03-01",
    address: "1420 Industrial Rd, El Dorado, KS 67042",
    lines: ["Business Insurance", "360 Safety Program"],
    notes: "Steel fabrication. Workers comp is the big exposure. Safety program in place since 2024.",
    claims: [
      { id: "cl1", date: "2025-08-14", type: "Workers Comp", status: "Closed", amount: 42000, desc: "Hand injury, press operator. Returned to work after 6 weeks." },
      { id: "cl2", date: "2026-02-03", type: "Auto", status: "Open", amount: 8500, desc: "Fender bender, company truck in parking lot." },
    ],
  },
  {
    id: "ac2",
    name: "Walnut Valley Health",
    industry: "Healthcare",
    status: "Client",
    employees: 220,
    revenue: 31000000,
    renewal: "2026-12-01",
    address: "88 Medical Pkwy, Arkansas City, KS 67005",
    lines: ["Employee Benefits", "Cyber Insurance"],
    notes: "Regional clinic network. Group benefits renewal is the key annual event.",
    claims: [
      { id: "cl3", date: "2025-11-20", type: "Cyber", status: "Closed", amount: 15000, desc: "Phishing incident, no data exfiltration confirmed. Notification costs only." },
    ],
  },
  {
    id: "ac3",
    name: "Cottonwood Oil & Gas",
    industry: "Oil & Gas",
    status: "Prospect",
    employees: 40,
    revenue: 9000000,
    renewal: "",
    address: "500 Derrick Rd, Garden City, KS 67846",
    lines: [],
    notes: "Cold lead. Concerned about cyber/breach exposure. No coverage with us yet.",
    claims: [],
  },
]);

const seedDeals = () => ([
  { id: "d1", client: "Prairie Steel Fabricators", line: "Business Insurance", premium: 48000, stage: "discovery", outcome: null, owner: "You", note: "Construction GL + workers comp renewal" },
  { id: "d2", client: "Heartland Trucking Co.", line: "Business Insurance", premium: 132000, stage: "proposal", outcome: null, owner: "You", note: "Fleet of 40, comparing 3 carriers" },
  { id: "d3", client: "Walnut Valley Health", line: "Employee Benefits", premium: 86000, stage: "negotiation", outcome: null, owner: "You", note: "Group medical, dental, vision" },
  { id: "d4", client: "El Dorado Bistro", line: "Personal Insurance", premium: 4200, stage: "first_touch", outcome: null, owner: "You", note: "Owner referral from existing client" },
  { id: "d5", client: "Cottonwood Oil & Gas", line: "Cyber Insurance", premium: 27500, stage: "prospecting", outcome: null, owner: "You", note: "Cold lead, breach concern" },
]);

const seedContacts = () => ([
  {
    id: "c1",
    name: "Dale Brenner",
    company: "Prairie Steel Fabricators",
    accountId: "ac1",
    email: "dale@prairiesteel.com",
    phone: "(316) 555-0142",
    address: "1420 Industrial Rd, El Dorado, KS 67042",
    details: "Owner. Prefers calls in the morning. Renewal in March.",
    activities: [
      { id: "a1", type: "Meeting", date: "2026-06-10", note: "Walked through GL + workers comp options" },
      { id: "a2", type: "Email", date: "2026-06-12", note: "Sent loss runs request" },
    ],
  },
  {
    id: "c2",
    name: "Maria Coffey",
    company: "Walnut Valley Health",
    accountId: "ac2",
    email: "mcoffey@wvhealth.org",
    phone: "(620) 555-0188",
    address: "88 Medical Pkwy, Arkansas City, KS 67005",
    details: "HR Director. Decision-maker on group benefits.",
    activities: [
      { id: "a3", type: "Proposal sent", date: "2026-06-15", note: "Group medical/dental/vision proposal delivered" },
    ],
  },
]);

const seedTasks = () => ([
  { id: "t1", type: "Call", title: "Follow up on workers comp quote", due: "2026-06-24", linkType: "deal", linkId: "d1", done: false },
  { id: "t2", type: "Email", title: "Send Heartland updated fleet proposal", due: "2026-06-27", linkType: "deal", linkId: "d2", done: false },
  { id: "t3", type: "Text", title: "Check in with Dale on loss runs", due: "2026-06-26", linkType: "contact", linkId: "c1", done: false },
  { id: "t4", type: "Call", title: "Confirm benefits enrollment timeline", due: "2026-06-30", linkType: "contact", linkId: "c2", done: false },
]);

const EVENT_TYPES = ["Meeting", "Appointment", "Reminder", "Personal", "Renewal", "Other"];

const seedEvents = () => ([
  { id: "e1", title: "Quarterly review — Walnut Valley Health", date: "2026-06-29", start: "10:00", end: "11:00", type: "Meeting", notes: "Benefits renewal prep", linkType: "account", linkId: "ac2" },
  { id: "e2", title: "Lunch w/ Dale Brenner", date: "2026-06-26", start: "12:00", end: "13:00", type: "Appointment", notes: "", linkType: "contact", linkId: "c1" },
]);

const fmtMoney = (n) =>
  n >= 1000 ? "$" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k" : "$" + n;
const fmtFull = (n) => "$" + (Number(n) || 0).toLocaleString("en-US");
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
};
// Whole days from today to the given ISO date. Negative = past.
const daysFromToday = (iso) => {
  if (!iso) return null;
  const today = new Date(todayISO() + "T00:00:00");
  const target = new Date(iso + "T00:00:00");
  return Math.round((target - today) / 86400000);
};
const lastActivityDate = (contact) => {
  const acts = (contact && contact.activities) || [];
  if (!acts.length) return null;
  return acts.map((a) => a.date).sort().slice(-1)[0];
};

export default function App() {
  const [tab, setTab] = useState("pipeline");
  const [deals, setDeals] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [newbiz, setNewbiz] = useState(null);
  const [events, setEvents] = useState(null);
  const [saving, setSaving] = useState(false);

  // ── Load all datasets from Supabase ────────────────────────────────
  useEffect(() => {
    (async () => {
      const uid = getUserId();
      const load = async (key, fallback) => {
        try {
          const { data } = await supabase
            .from("user_data")
            .select("value")
            .eq("user_id", uid)
            .eq("key", key)
            .single();
          return data ? JSON.parse(data.value) : fallback();
        } catch {
          return fallback();
        }
      };
      setDeals(await load(DEALS_KEY, seedDeals));
      setAccounts(await load(ACCOUNTS_KEY, seedAccounts));
      setContacts(await load(CONTACTS_KEY, seedContacts));
      setTasks(await load(TASKS_KEY, seedTasks));
      setNewbiz(await load(NEWBIZ_KEY, () => []));
      setEvents(await load(EVENTS_KEY, seedEvents));
    })();
  }, []);

  const flash = useCallback(() => {
    setSaving(true);
    setTimeout(() => setSaving(false), 350);
  }, []);

  const persist = useCallback(async (key, setter, next) => {
    setter(next);
    flash();
    try {
      await supabase.from("user_data").upsert(
        { user_id: getUserId(), key, value: JSON.stringify(next), updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      );
    } catch {}
  }, [flash]);

  const persistDeals    = useCallback((next) => persist(DEALS_KEY,    setDeals,    next), [persist]);
  const persistAccounts = useCallback((next) => persist(ACCOUNTS_KEY, setAccounts, next), [persist]);
  const persistContacts = useCallback((next) => persist(CONTACTS_KEY, setContacts, next), [persist]);
  const persistTasks    = useCallback((next) => persist(TASKS_KEY,    setTasks,    next), [persist]);
  const persistNewbiz   = useCallback((next) => persist(NEWBIZ_KEY,   setNewbiz,   next), [persist]);
  const persistEvents   = useCallback((next) => persist(EVENTS_KEY,   setEvents,   next), [persist]);

  if (!deals || !accounts || !contacts || !tasks || !newbiz || !events) {
    return (
      <div style={S.shell}>
        <div style={{ ...S.muted, padding: 40 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={S.shell}>
      <style>{CSS}</style>

      <header style={S.header}>
        <div>
          <div style={S.kicker}>ICI INSURANCE · SINCE 1885</div>
          <h1 style={S.h1}>{tab === "pipeline" ? "Sales Pipeline" : tab === "accounts" ? "Accounts" : tab === "newbiz" ? "New Business" : tab === "contacts" ? "Contacts" : tab === "calendar" ? "Calendar" : "Tasks & Reminders"}</h1>
        </div>
        <div style={S.saveTag}>{saving ? "Saving…" : "All changes saved"}</div>
      </header>

      <div style={S.tabs}>
        <button
          onClick={() => setTab("pipeline")}
          style={{ ...S.tab, ...(tab === "pipeline" ? S.tabActive : {}) }}
        >
          Pipeline
        </button>
        <button
          onClick={() => setTab("accounts")}
          style={{ ...S.tab, ...(tab === "accounts" ? S.tabActive : {}) }}
        >
          Accounts
        </button>
        <button
          onClick={() => setTab("contacts")}
          style={{ ...S.tab, ...(tab === "contacts" ? S.tabActive : {}) }}
        >
          Contacts
        </button>
        <button
          onClick={() => setTab("tasks")}
          style={{ ...S.tab, ...(tab === "tasks" ? S.tabActive : {}) }}
        >
          Tasks
          {tasks.filter((t) => !t.done).length > 0 && (
            <span style={S.tabBadge}>{tasks.filter((t) => !t.done).length}</span>
          )}
        </button>
        <button
          onClick={() => setTab("newbiz")}
          style={{ ...S.tab, ...(tab === "newbiz" ? S.tabActive : {}) }}
        >
          New Business
        </button>
        <button
          onClick={() => setTab("calendar")}
          style={{ ...S.tab, ...(tab === "calendar" ? S.tabActive : {}) }}
        >
          Calendar
        </button>
      </div>

      {tab === "pipeline" ? (
        <Pipeline deals={deals} persist={persistDeals} />
      ) : tab === "accounts" ? (
        <Accounts
          accounts={accounts}
          contacts={contacts}
          persist={persistAccounts}
          goToContacts={() => setTab("contacts")}
        />
      ) : tab === "newbiz" ? (
        <NewBusiness
          newbiz={newbiz}
          accounts={accounts}
          contacts={contacts}
          persist={persistNewbiz}
        />
      ) : tab === "contacts" ? (
        <Contacts contacts={contacts} accounts={accounts} persist={persistContacts} />
      ) : tab === "calendar" ? (
        <Calendar
          events={events}
          tasks={tasks}
          accounts={accounts}
          contacts={contacts}
          deals={deals}
          persistEvents={persistEvents}
          persistTasks={persistTasks}
        />
      ) : (
        <Tasks
          tasks={tasks}
          deals={deals}
          contacts={contacts}
          persist={persistTasks}
          goTo={setTab}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ICI New Business Application — embedded PDF template + field maps
// ════════════════════════════════════════════════════════════════════════
// Auto-generated field maps for the ICI New Business Application PDF
const PDF_TEXTMAP = {"effectiveDate":"Effective Date","needByDate":"Need by Date","producer":"Producer","firstNamedInsured":"First Named Insured","fein":"FEIN","mailingAddress":"Mailing Address","website":"Website","officePhone":"Office Phone","fax":"Fax","ownerNamePosition":"Owner Name  Position","ownerEmail":"Email","ownerPhone":"Phone","insContactNamePosition":"Insurance Contact Name  Position","insContactEmail":"Email_2","insContactPhone":"Phone_2","additionalNamedInsured":"Additional Named Insureds","additionalFein":"FEIN_2","additionalRelationship":"DescriptionRelationship of Additional Named Insureds 1","ownersOwnership":"Owners  Ownership","yearsExperience":"Years Experience","narrative":"Narrative of Operations","propLocationAddress":"Location Address","propConstructionType":"Construction Type","propStories":"Number of Stories","propCounty":"County","propYearBuilt":"Year Built","propSquareFt":"Square Ft","propAopDeductible":"AOP Deductible","propWindHailDeductible":"WindHail Deductible","propBuildingLimit":"Building Limit","propBppLimit":"BPP Limit","propBusinessIncomeLimit":"Business Income Limit","propElectric":"Electric","propPlumbing":"Plumbing","propRoof":"Roof","propHeating":"Heating","propRoofType":"Roof Type","propMortgagee":"Mortgagee","propAdditionalInsured":"Additional Insureds","glLimits":"Limits","glMedicalPaymentLimit":"Medical Payment Limit","glDeductible":"Deductible","glAnnualSales":"Annual Sales","glAnnualPayroll":"Annual Payroll excl Clerical  Sales","glClassCodes":"Class CodesDescriptions Forms needed 1","glAdditionalInsured":"Additional Insureds_2","autoLiabilityLimit":"Liability Limit","autoPip":"PIP","autoDeductibles":"Deductibles CompCollision","wcOwnerClassCode":"If Included Class Code","wcOwnerPayroll":"Payroll_8","wcExperienceMod":"Experience Mod","wcEmployersLiabilityLimit":"Employers Liability Limit","wcNotes":"Notes","imCoverageLimit":"INLAND MARINE CoverageLimit","imDeductible":"Deductible_2","imLeasedRentedLimit":"LeasedRented Equipment Limit","umbrellaLimit":"Limit","umbrellaDeductible":"Deductible_3","epliLimit":"Limit_2","epliDeductible":"Deductible_4","cyberLimit":"Limit_3","cyberDeductible":"Deductible_5","marketsToApproach":"Markets to Approach","targetPremium":"Target Premium","specialInstructions":"Special Instructions 1"};
const PDF_AUTOMAP = [{"year":"Year","make":"Make","model":"Model","lienholder":"Lienholder","vin":"VIN","costNew":"Cost New"},{"year":"Year_2","make":"Make_2","model":"Model_2","lienholder":"Lienholder_2","vin":"VIN_2","costNew":"Cost New_2"},{"year":"Year_3","make":"Make_3","model":"Model_3","lienholder":"Lienholder_3","vin":"VIN_3","costNew":"Cost New_3"},{"year":"Year_4","make":"Make_4","model":"Model_4","lienholder":"Lienholder_4","vin":"VIN_4","costNew":"Cost New_4"},{"year":"Year_5","make":"Make_5","model":"Model_5","lienholder":"Lienholder_5","vin":"VIN_5","costNew":"Cost New_5"}];
const PDF_DRIVERMAP = [{"name":"Name","dl":"DL","state":"State","dob":"DOB"},{"name":"Name_2","dl":"DL_2","state":"State_2","dob":"DOB_2"},{"name":"Name_3","dl":"DL_3","state":"State_3","dob":"DOB_3"},{"name":"Name_4","dl":"DL_4","state":"State_4","dob":"DOB_4"},{"name":"Name_5","dl":"DL_5","state":"State_5","dob":"DOB_5"},{"name":"Name_6","dl":"DL_6","state":"State_6","dob":"DOB_6"},{"name":"Name_7","dl":"DL_7","state":"State_7","dob":"DOB_7"}];
const PDF_WCMAP = [{"classCode":"Class Code","payroll":"Payroll","ft":"EE  FT","pt":"PT"},{"classCode":"Class Code_2","payroll":"Payroll_2","ft":"EE  FT_2","pt":"PT_2"},{"classCode":"Class Code_3","payroll":"Payroll_3","ft":"EE  FT_3","pt":"PT_3"},{"classCode":"Class Code_4","payroll":"Payroll_4","ft":"EE  FT_4","pt":"PT_4"},{"classCode":"Class Code_5","payroll":"Payroll_5","ft":"EE  FT_5","pt":"PT_5"},{"classCode":"Class Code_6","payroll":"Payroll_6","ft":"EE  FT_6","pt":"PT_6"},{"classCode":"Class Code_7","payroll":"Payroll_7","ft":"EE  FT_7","pt":"PT_7"}];
const PDF_CHECKMAP = {"entityType=Individual/Sole Prop":{"page":1,"cx":115.0,"cy":408.3},"entityType=Corporation":{"page":1,"cx":219.5,"cy":408.3},"entityType=LLC":{"page":1,"cx":289.4,"cy":408.3},"entityType=Not for Profit":{"page":1,"cx":332.3,"cy":408.3},"propOccupancy=Owner Occupied":{"page":1,"cx":254.6,"cy":208.3},"propOccupancy=Lessor's Risk":{"page":1,"cx":349.3,"cy":208.3},"propOccupancy=Tenant":{"page":1,"cx":430.3,"cy":208.3},"propSprinklered=Yes":{"page":1,"cx":133.9,"cy":116.2},"propSprinklered=No":{"page":1,"cx":169.0,"cy":116.2},"propAlarm=Yes":{"page":1,"cx":241.0,"cy":116.2},"propAlarm=No":{"page":1,"cx":277.0,"cy":116.2},"propFlood=Yes":{"page":2,"cx":351.4,"cy":673.1},"propFlood=No":{"page":2,"cx":392.0,"cy":673.1},"propEarthquake=Yes":{"page":2,"cx":491.5,"cy":673.1},"propEarthquake=No":{"page":2,"cx":531.5,"cy":673.1},"glEbl=Yes":{"page":2,"cx":287.0,"cy":407.8},"glEbl=No":{"page":2,"cx":328.3,"cy":407.8},"autoScheduleAttached=Yes":{"page":2,"cx":388.0,"cy":369.2},"autoScheduleAttached=No":{"page":2,"cx":436.1,"cy":369.2},"wcOwners=Included":{"page":3,"cx":138.5,"cy":274.9},"wcOwners=Excluded":{"page":3,"cx":197.9,"cy":274.9},"commonOwnership=Yes":{"page":1,"cx":179.2,"cy":431.3},"commonOwnership=No":{"page":1,"cx":225.5,"cy":431.3},"glHiredNonOwned=Yes":{"page":2,"cx":477.0,"cy":539.0},"glHiredNonOwned=No":{"page":2,"cx":532.0,"cy":539.0},"umbrella=Yes":{"page":3,"cx":167.0,"cy":123.0},"umbrella=No":{"page":3,"cx":201.0,"cy":123.0},"epli=Yes":{"page":3,"cx":122.0,"cy":84.0},"epli=No":{"page":3,"cx":156.0,"cy":84.0},"cyber=Yes":{"page":4,"cx":139.9,"cy":680.9},"cyber=No":{"page":4,"cx":173.6,"cy":680.9},"policyDelivery=Producer":{"page":4,"cx":135.5,"cy":599.6},"policyDelivery=Producer to Sign & Mail":{"page":4,"cx":198.2,"cy":599.6},"policyDelivery=AM to Deliver":{"page":4,"cx":326.1,"cy":599.6},"policyDelivery=AM to Email":{"page":4,"cx":411.5,"cy":599.6},"policyDelivery=QM to Mail":{"page":4,"cx":493.3,"cy":599.6}};
// ICI New Business Application — base64 of the fillable PDF template
const ICI_NB_PDF_B64 = "JVBERi0xLjYNJeLjz9MNCjgxNCAwIG9iag08PC9MaW5lYXJpemVkIDEvTCAxMjk3MTEvTyA4MTcvRSA0NTAxMS9OIDQvVCAxMjkwOTQvSCBbIDg5NCAxMjE5XT4+DWVuZG9iag0gICAgICAgICAgICAgDQo5MTggMCBvYmoNPDwvRGVjb2RlUGFybXM8PC9Db2x1bW5zIDQvUHJlZGljdG9yIDEyPj4vRW5jcnlwdCA4MTUgMCBSL0ZpbHRlci9GbGF0ZURlY29kZS9JRFs8REE4NTBEMzgxODI5Qzk0NDlEQ0IyQUE0OEQ0NEYxNTg+PDMyRDZFNDIzQjk1RjgzNEJCQzAyM0I3ODRDNDQxQzc3Pl0vSW5kZXhbODE0IDE3NF0vSW5mbyA4MTMgMCBSL0xlbmd0aCAxNzAvUHJldiAxMjkwOTUvUm9vdCA4MTYgMCBSL1NpemUgOTg4L1R5cGUvWFJlZi9XWzEgMiAxXT4+c3RyZWFtDQpo3mJiZBBgYGLgMAQSjNeABMN+IMFUDuJ+hBOfUAiGT5hiSARYhwOIYAUZlQhiBcK4jImohoJYTA6osoGoej9iWo6uwwGumBXFcrAsNsVIxqPJgi36gNeDeA1gwmbeRyysT1gsx2UyVpd+wGIyiBB6DCRYxIEEszqIALFY2kEsd5gYy3IgIdwEYoWDtHUDiaA7DEyMzGKgIGZgHCWoRvxn+LIXIMAAmo863w0KZW5kc3RyZWFtDWVuZG9iag1zdGFydHhyZWYNCjANCiUlRU9GDQogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA0KOTg3IDAg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IG9iag08PC9CQm94WzAuMCAwLjAgMTMwLjIgMjIuMDhdL0ZpbHRlci9GbGF0ZURlY29kZS9Gb3JtVHlwZSAxL0xlbmd0aCA0OC9NYXRyaXhbMS4wIDAuMCAwLjAgMS4wIDAuMCAwLjBdL1Jlc291cmNlczw8L1Byb2NTZXRbL1BERl0+Pi9TdWJ0eXBlL0Zvcm0vVHlwZS9YT2JqZWN0Pj5zdHJlYW0NCnzSQLkv47ijNvKhwVyAPmGLS/FzdKWXKoT3BAjCxZEMSOpA5pUJQKW4BI40gtArCg0KZW5kc3RyZWFtDWVuZG9iag04ODUgMCBvYmoNPDwvQkJveFswLjAgMC4wIDE2NC44OCAyMi4wOF0vRmlsdGVyL0ZsYXRlRGVjb2RlL0Zvcm1UeXBlIDEvTGVuZ3RoIDQ4L01hdHJpeFsxLjAgMC4wIDAuMCAxLjAgMC4wIDAuMF0vUmVzb3VyY2VzPDwvUHJvY1NldFsvUERGXT4+L1N1YnR5cGUvRm9ybS9UeXBlL1hPYmplY3Q+PnN0cmVhbQ0KO15jQLLyc8qlDcOMkE/dIaI8yCx5K8/Rz7WpqIJc3WfvjZYgN6GO0E79zIy9aNU9DQplbmRzdHJlYW0NZW5kb2JqDTg4NiAwIG9iag08PC9CQm94WzAuMCAwLjAgMTE0LjAgMjIuMDhdL0ZpbHRlci9GbGF0ZURlY29kZS9Gb3JtVHlwZSAxL0xlbmd0aCA0OC9NYXRyaXhbMS4wIDAuMCAwLjAgMS4wIDAuMCAwLjBdL1Jlc291cmNlczw8L1Byb2NTZXRbL1BERl0+Pi9TdWJ0eXBlL0Zvcm0vVHlwZS9YT2JqZWN0Pj5zdHJlYW0NCuFXEFBCpehE5fPTsurUmwix8/MisVzCibvDEXwUennzC4FPNhLA3et6u67TUdhGvA0KZW5kc3RyZWFtDWVuZG9iag04ODcgMCBvYmoNPDwvQkJveFswLjAgMC4wIDEyNS44OCAyMi4wOF0vRmlsdGVyL0ZsYXRlRGVjb2RlL0Zvcm1UeXBlIDEvTGVuZ3RoIDQ4L01hdHJpeFsxLjAgMC4wIDAuMCAxLjAgMC4wIDAuMF0vUmVzb3VyY2VzPDwvUHJvY1NldFsvUERGXT4+L1N1YnR5cGUvRm9ybS9UeXBlL1hPYmplY3Q+PnN0cmVhbQ0K/qZONvbW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ZG9iag0xMDIgMCBvYmoNPDwvQkJveFswLjAgMC4wIDc5LjY4IDIyLjMyXS9GaWx0ZXIvRmxhdGVEZWNvZGUvRm9ybVR5cGUgMS9MZW5ndGggNDgvTWF0cml4WzEuMCAwLjAgMC4wIDEuMCAwLjAgMC4wXS9SZXNvdXJjZXM8PC9Qcm9jU2V0Wy9QREZdPj4vU3VidHlwZS9Gb3JtL1R5cGUvWE9iamVjdD4+c3RyZWFtDQr1NiXAAgLTAO/ui5molU1Lve3VpL3nF7ZFrdpalyUQ5KShClP6yaUE2WAiR2Rn7zgNCmVuZHN0cmVhbQ1lbmRvYmoNMTAzIDAgb2JqDTw8L0JCb3hbMC4wIDAuMCA0NC43NiAyMi4zMl0vRmlsdGVyL0ZsYXRlRGVjb2RlL0Zvcm1UeXBlIDEvTGVuZ3RoIDQ4L01hdHJpeFsxLjAgMC4wIDAuMCAxLjAgMC4wIDAuMF0vUmVzb3VyY2VzPDwvUHJvY1NldFsvUERGXT4+L1N1YnR5cGUvRm9ybS9UeXBlL1hPYmplY3Q+PnN0cmVhbQ0K6CzZk5cYBNMtchtb2eH0n1Pf+OhpNqBItIaJ5W2nSGDK0TWFBZooi56QV0VUgW3XDQplbmRzdHJlYW0NZW5kb2JqDTEwNCAwIG9iag08PC9CQm94WzAuMCAwLjAgNzkuNjggMjIuMzJdL0ZpbHRlci9GbGF0ZURlY29kZS9Gb3JtVHlwZSAxL0xlbmd0aCA0OC9NYXRyaXhbMS4wIDAuMCAwLjAgMS4wIDAuMCAwLjBdL1Jlc291cmNlczw8L1Byb2NTZXRbL1BERl0+Pi9TdWJ0eXBlL0Zvcm0vVHlwZS9YT2JqZWN0Pj5zdHJlYW0NCs+6imjxKOxdy8PdHzdFaLG1DwnquNuljnNJfcOI2N8ZmUFVuQ2EY3zmO1Netaf7Lg0KZW5kc3RyZWFtDWVuZG9iag0xMDUgMCBvYmoNPDwvQkJveFswLjAgMC4wIDExMC4xNiAyMi4zMl0vRmlsdGVyL0ZsYXRlRGVjb2RlL0Zvcm1UeXBlIDEvTGVuZ3RoIDQ4L01hdHJpeFsxLjAgMC4wIDAuMCAxLjAgMC4wIDAuMF0vUmVzb3VyY2VzPDwvUHJvY1NldFsvUERGXT4+L1N1YnR5cGUvRm9ybS9UeXBlL1hPYmplY3Q+PnN0cmVh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GnULBTQtDQplbmRzdHJlYW0NZW5kb2JqDTExNyAwIG9iag08PC9CQm94WzAuMCAwLjAgMTAzLjY4IDIyLjMyXS9GaWx0ZXIvRmxhdGVEZWNvZGUvRm9ybVR5cGUgMS9MZW5ndGggNDgvTWF0cml4WzEuMCAwLjAgMC4wIDEuMCAwLjAgMC4wXS9SZXNvdXJjZXM8PC9Qcm9jU2V0Wy9QREZdPj4vU3VidHlwZS9Gb3JtL1R5cGUvWE9iamVjdD4+c3RyZWFtDQq6zyvPtOjgDET3W/Aez5y9ob7RSRSJmUUhfqEOTrJ67UQnQAlxe69uW2fbzhxiGWoNCmVuZHN0cmVhbQ1lbmRvYmoNMTE4IDAgb2JqDTw8L0JCb3hbMC4wIDAuMCA2Mi4xNiAyMi4zMl0vRmlsdGVyL0ZsYXRlRGVjb2RlL0Zvcm1UeXBlIDEvTGVuZ3RoIDQ4L01hdHJpeFsxLjAgMC4wIDAuMCAxLjAgMC4wIDAuMF0vUmVzb3VyY2VzPDwvUHJvY1NldFsvUERGXT4+L1N1YnR5cGUvRm9ybS9UeXBlL1hPYmplY3Q+PnN0cmVhbQ0KBVhKVmdAdD6fZ0FW6qGnao3sO8Foao0VTNOz+DJJfWi/j/Ru8CBgJdDC7u3OnoS5DQplbmRzdHJlYW0NZW5kb2JqDTExOSAwIG9iag08PC9CQm94WzAuMCAwLjAgNTIuMzIgMjIuMzJdL0ZpbHRlci9GbGF0ZURlY29kZS9Gb3JtVHlwZSAxL0xlbmd0aCA0OC9NYXRyaXhbMS4wIDAuMCAwLjAgMS4wIDAuMCAwLjBdL1Jlc291cmNlczw8L1Byb2NTZXRbL1BERl0+Pi9TdWJ0eXBlL0Zvcm0vVHlwZS9YT2JqZWN0Pj5zdHJlYW0NCrbyQNWHkzVqc1BH0zapU73++ypR+DDQxLUs/fHqXjjR51LETqxSyzaaXHey01Z0fw0KZW5kc3RyZWFtDWVuZG9iag0xMjAgMCBvYmoNPDwvQkJveFswLjAgMC4wIDUyLjMyIDIyLjMyXS9GaWx0ZXIvRmxhdGVEZWNvZGUvRm9ybVR5cGUgMS9MZW5ndGggNDgvTWF0cml4WzEuMCAwLjAgMC4wIDEuMCAwLjAgMC4wXS9SZXNvdXJjZXM8PC9Qcm9jU2V0Wy9QREZdPj4vU3VidHlwZS9Gb3Jt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UERGXT4+L1N1YnR5cGUvRm9ybS9UeXBlL1hPYmplY3Q+PnN0cmVhbQ0KxohaOXm+IHzG5ivz7WyOdFkomXZ8YDrPsEaJs3QnOKbpK6v6GZ+Gp6jnuy4Kfz0wDQplbmRzdHJlYW0NZW5kb2JqDTEzNiAwIG9iag08PC9CQm94WzAuMCAwLjAgNTIuMzIgMjIuMzJdL0ZpbHRlci9GbGF0ZURlY29kZS9Gb3JtVHlwZSAxL0xlbmd0aCA0OC9NYXRyaXhbMS4wIDAuMCAwLjAgMS4wIDAuMCAwLjBdL1Jlc291cmNlczw8L1Byb2NTZXRbL1BERl0+Pi9TdWJ0eXBlL0Zvcm0vVHlwZS9YT2JqZWN0Pj5zdHJlYW0NCiHQPBvO/jdiJr17rCtaWAlSN2HJlR+AmcLYtrk8CM3/vTh1Clasoo2igmRDSDOfag0KZW5kc3RyZWFtDWVuZG9iag0xMzcgMCBvYmoNPDwvQkJveFswLjAgMC4wIDUxLjQ4IDIyLjMyXS9GaWx0ZXIvRmxhdGVEZWNvZGUvRm9ybVR5cGUgMS9MZW5ndGggNDgvTWF0cml4WzEuMCAwLjAgMC4wIDEuMCAwLjAgMC4wXS9SZXNvdXJjZXM8PC9Qcm9jU2V0Wy9QREZdPj4vU3VidHlwZS9Gb3JtL1R5cGUvWE9iamVjdD4+c3RyZWFtDQpElUxLcWg7Y6zsdTy8DT7/cp4NUHIXnA3/Khh8ijLSPNiG3bw8LHx7t9/UzBW5w2INCmVuZHN0cmVhbQ1lbmRvYmoNMTM4IDAgb2JqDTw8L0JCb3hbMC4wIDAuMCA2Mi4xNiAyMi4zMl0vRmlsdGVyL0ZsYXRlRGVjb2RlL0Zvcm1UeXBlIDEvTGVuZ3RoIDQ4L01hdHJpeFsxLjAgMC4wIDAuMCAxLjAgMC4wIDAuMF0vUmVzb3VyY2VzPDwvUHJvY1NldFsvUERGXT4+L1N1YnR5cGUvRm9ybS9UeXBlL1hPYmplY3Q+PnN0cmVhbQ0KR7xfSpByiBqv0/WyIel9Gz7w+h/cb0/00MWq3Oo43QuFMXGLG75bknFqmtF8lk8gDQplbmRzdHJlYW0NZW5kb2JqDTEzOSAwIG9iag08PC9CQm94WzAuMCAwLjAgNjIuMTYgMjIuMzJdL0ZpbHRlci9GbGF0ZURlY29kZS9Gb3JtVHlwZSAx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";

// ════════════════════════════════════════════════════════════════════════
// NEW BUSINESS TAB  (fill the ICI New Business Application; export to PDF)
// ════════════════════════════════════════════════════════════════════════

// Build a blank application record.
const blankApp = (accountId) => ({
  id: "nb" + Date.now(),
  accountId: accountId || "",
  label: "",
  status: "Draft",
  updated: todayISO(),
  raw: "",            // pasted reference info
  data: {},           // keyed by field.k
});

// Pull what we can from a linked account + its primary contact into form data.
function prefillFromAccount(account, contacts) {
  if (!account) return {};
  const people = (contacts || []).filter((c) => c.accountId === account.id || c.company === account.name);
  const primary = people[0];
  const d = {
    firstNamedInsured: account.name || "",
    website: "",
    mailingAddress: account.address || "",
    narrative: account.notes || "",
    propLocationAddress: account.address || "",
  };
  if (primary) {
    d.ownerNamePosition = primary.name || "";
    d.ownerEmail = primary.email || "";
    d.ownerPhone = primary.phone || "";
  }
  // Industry → a hint in the narrative if empty handled above.
  return d;
}

function NewBusiness({ newbiz, accounts, contacts, persist }) {
  const [selectedId, setSelectedId] = useState(newbiz[0]?.id || null);
  const selected = newbiz.find((n) => n.id === selectedId) || null;

  const createApp = (accountId) => {
    const acct = accounts.find((a) => a.id === accountId);
    const app = blankApp(accountId);
    app.label = acct ? acct.name : "Untitled application";
    if (acct) app.data = prefillFromAccount(acct, contacts);
    const next = [app, ...newbiz];
    persist(next);
    setSelectedId(app.id);
  };

  const updateApp = (patch) => {
    persist(newbiz.map((n) => (n.id === selected.id ? { ...n, ...patch, updated: todayISO() } : n)));
  };
  const deleteApp = (id) => {
    const next = newbiz.filter((n) => n.id !== id);
    persist(next);
    setSelectedId(next[0]?.id || null);
  };

  return (
    <div style={S.contactsLayout} className="ici-contacts-layout">
      {/* List pane */}
      <div style={S.listPane} className="ici-list-pane">
        <NewAppButton accounts={accounts} onCreate={createApp} />
        <div style={{ ...S.list, marginTop: 12 }}>
          {newbiz.length === 0 && <div style={S.empty}>No applications yet. Start one above.</div>}
          {newbiz.map((n) => {
            const acct = accounts.find((a) => a.id === n.accountId);
            return (
              <button
                key={n.id}
                onClick={() => setSelectedId(n.id)}
                style={{ ...S.listItem, ...(selected && n.id === selected.id ? S.listItemActive : {}) }}
              >
                <span style={S.listName}>{n.label || acct?.name || "Untitled"}</span>
                <span style={S.listCompany}>{acct ? acct.industry : "Standalone"}</span>
                <span style={S.acctRowMeta}>
                  <span style={{ ...S.statusPill, ...nbStatusStyle(n.status) }}>{n.status}</span>
                  <span style={S.listMeta}>Updated {fmtDate(n.updated)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail pane */}
      <div style={S.detailPane}>
        {!selected ? (
          <div style={{ ...S.empty, padding: 40 }}>
            Select an application, or start a new one. Each application fills the ICI New Business
            Application and exports to PDF for carrier submission.
          </div>
        ) : (
          <NewBusinessForm
            app={selected}
            account={accounts.find((a) => a.id === selected.accountId)}
            contacts={contacts}
            onUpdate={updateApp}
            onDelete={() => deleteApp(selected.id)}
          />
        )}
      </div>
    </div>
  );
}

function NewAppButton({ accounts, onCreate }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button className="ici-pri-btn" style={{ ...S.addBtn, width: "100%" }} onClick={() => setOpen((o) => !o)}>
        + New application
      </button>
      {open && (
        <div style={S.nbDropdown}>
          <div style={S.nbDropHead}>Tie to an account</div>
          {accounts.map((a) => (
            <button key={a.id} style={S.nbDropItem} className="ici-rem-line" onClick={() => { onCreate(a.id); setOpen(false); }}>
              {a.name}
            </button>
          ))}
          <button style={{ ...S.nbDropItem, color: MUTE, borderTop: `1px solid ${RULE}` }} className="ici-rem-line" onClick={() => { onCreate(""); setOpen(false); }}>
            Standalone (no account)
          </button>
        </div>
      )}
    </div>
  );
}

function NewBusinessForm({ app, account, contacts, onUpdate, onDelete }) {
  const [openSection, setOpenSection] = useState("general");
  const [exporting, setExporting] = useState(false);

  const data = app.data || {};
  const setField = (k, v) => onUpdate({ data: { ...data, [k]: v } });

  // progress: count filled scalar fields across all sections
  const allFields = NB_SECTIONS.flatMap((s) => s.fields || []);
  const filled = allFields.filter((f) => {
    const v = data[f.k];
    return v !== undefined && v !== "" && v !== null;
  }).length;
  const pct = Math.round((filled / allFields.length) * 100);

  const doPrefill = () => {
    if (!account) return;
    onUpdate({ data: { ...prefillFromAccount(account, contacts), ...data } });
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await exportApplicationPdf(app, account);
    } catch (e) {
      console.error(e);
      alert("PDF export ran into an issue. Your data is saved — try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={S.detailHead}>
        <div>
          <h2 style={S.detailName}>{app.label || account?.name || "New Business Application"}</h2>
          <div style={S.acctSubRow}>
            <span style={{ ...S.statusPill, ...nbStatusStyle(app.status) }}>{app.status}</span>
            <span style={S.detailCompany}>{account ? account.name : "Standalone"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select style={{ ...S.input, width: "auto", padding: "6px 10px" }} value={app.status} onChange={(e) => onUpdate({ status: e.target.value })}>
            {["Draft", "Ready to submit", "Submitted", "Quoted", "Bound"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <button style={S.deleteBtn} onClick={onDelete}>Delete</button>
        </div>
      </div>

      {/* Progress + actions */}
      <div style={S.nbToolbar}>
        <div style={{ flex: 1 }}>
          <div style={S.nbProgressTrack}>
            <div style={{ ...S.nbProgressFill, width: pct + "%" }} />
          </div>
          <div style={S.nbProgressLabel}>{filled} of {allFields.length} fields · {pct}% complete</div>
        </div>
        {account && <button style={S.editBtn} onClick={doPrefill}>Prefill from account</button>}
        <button className="ici-pri-btn" style={S.saveBtn} onClick={exportPdf} disabled={exporting}>
          {exporting ? "Filling ICI form…" : "Export ICI PDF"}
        </button>
      </div>

      {/* Paste-in reference area */}
      <div style={S.nbRawBox}>
        <div style={S.nbRawHead}>
          <span style={S.logTitle}>Reference info (paste here)</span>
          <span style={S.nbRawHint}>Drop website text, emails, appraiser data — for you to copy into the fields below.</span>
        </div>
        <textarea
          style={{ ...S.input, minHeight: 90, resize: "vertical", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12.5 }}
          value={app.raw || ""}
          onChange={(e) => onUpdate({ raw: e.target.value })}
          placeholder={"Example:\nWebsite About page text…\nCounty appraiser: year built 1998, 12,400 sq ft, masonry construction…\nFEIN 48-1234567 (from W-9)…"}
        />
      </div>

      {/* Sections (accordion) */}
      <div style={{ marginTop: 16 }}>
        {NB_SECTIONS.map((section) => {
          const isOpen = openSection === section.id;
          const secFields = section.fields || [];
          const secFilled = secFields.filter((f) => data[f.k] !== undefined && data[f.k] !== "" && data[f.k] !== null).length;
          return (
            <div key={section.id} style={S.nbSection}>
              <button
                style={S.nbSectionHead}
                onClick={() => setOpenSection(isOpen ? null : section.id)}
                className="ici-nb-sec"
              >
                <span style={S.nbSectionTitle}>{section.title}</span>
                <span style={S.nbSectionMeta}>
                  {secFields.length > 0 && <span style={S.nbSectionCount}>{secFilled}/{secFields.length}</span>}
                  <span style={S.nbChevron}>{isOpen ? "▾" : "▸"}</span>
                </span>
              </button>
              {isOpen && (
                <div style={S.nbSectionBody}>
                  {section.note && <div style={S.nbSectionNote}>{section.note}</div>}
                  {section.repeat && (
                    <RepeatGroup
                      group={section.repeat}
                      rows={data[section.repeat.k] || []}
                      onChange={(rows) => setField(section.repeat.k, rows)}
                    />
                  )}
                  <div style={S.nbFieldGrid}>
                    {secFields.map((f) => (
                      <FormField key={f.k} field={f} value={data[f.k]} onChange={(v) => setField(f.k, v)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormField({ field, value, onChange }) {
  const wideStyle = field.wide ? { gridColumn: "1 / -1" } : {};
  if (field.type === "textarea") {
    return (
      <label style={{ ...S.field, ...wideStyle, marginBottom: 0 }}>
        <span style={S.fieldLabel}>{field.label}</span>
        <textarea style={{ ...S.input, minHeight: 56, resize: "vertical" }} value={value || ""} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === "check") {
    return (
      <div style={{ ...S.field, ...wideStyle, marginBottom: 0 }}>
        <span style={S.fieldLabel}>{field.label}</span>
        <div style={S.nbCheckRow}>
          {["Yes", "No"].map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(value === opt ? "" : opt)}
              style={{ ...S.nbCheckBtn, ...(value === opt ? S.nbCheckOn : {}) }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "choice") {
    return (
      <div style={{ ...S.field, ...wideStyle, marginBottom: 0 }}>
        <span style={S.fieldLabel}>{field.label}</span>
        <div style={S.nbCheckRow}>
          {field.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(value === opt ? "" : opt)}
              style={{ ...S.nbChoiceBtn, ...(value === opt ? S.nbCheckOn : {}) }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }
  // text / date
  return (
    <label style={{ ...S.field, ...wideStyle, marginBottom: 0 }}>
      <span style={S.fieldLabel}>{field.label}</span>
      <input
        style={S.input}
        type={field.type === "date" ? "date" : "text"}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function RepeatGroup({ group, rows, onChange }) {
  const addRow = () => onChange([...rows, group.cols.reduce((o, c) => ({ ...o, [c.k]: "" }), { _id: "r" + Date.now() })]);
  const setCell = (i, k, v) => onChange(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={S.repeatHeadRow}>
        <span style={S.fieldLabel}>{group.label}</span>
        <button style={S.smallAddBtn} onClick={addRow}>{group.addLabel}</button>
      </div>
      {rows.length === 0 && <div style={{ ...S.empty, padding: "10px 8px" }}>None added yet.</div>}
      {rows.map((row, i) => (
        <div key={row._id || i} style={S.repeatRow}>
          {group.cols.map((c) => (
            <label key={c.k} style={{ flex: 1, minWidth: 90 }}>
              <span style={S.repeatColLabel}>{c.label}</span>
              <input style={{ ...S.input, padding: "6px 8px", fontSize: 13 }} value={row[c.k] || ""} onChange={(e) => setCell(i, c.k, e.target.value)} />
            </label>
          ))}
          <button style={{ ...S.activityDel, marginTop: 18 }} onClick={() => removeRow(i)} title="Remove">×</button>
        </div>
      ))}
    </div>
  );
}

function nbStatusStyle(status) {
  const map = {
    "Draft": { background: "#f1f5f9", color: "#64748b" },
    "Ready to submit": { background: "#e3ecfd", color: "#1452d6" },
    "Submitted": { background: "#fef9c3", color: "#a16207" },
    "Quoted": { background: "#f3e8ff", color: "#7c3aed" },
    "Bound": { background: "#dcfce7", color: "#15803d" },
  };
  return map[status] || map["Draft"];
}

// ── PDF export: fill the real ICI New Business Application via pdf-lib ──
let _pdflibPromise = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (_pdflibPromise) return _pdflibPromise;
  _pdflibPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
    s.onload = () => resolve(window.PDFLib);
    s.onerror = () => reject(new Error("Failed to load PDF library"));
    document.body.appendChild(s);
  });
  return _pdflibPromise;
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function exportApplicationPdf(app, account) {
  const PDFLib = await loadPdfLib();
  const { PDFDocument, rgb } = PDFLib;
  const bytes = b64ToBytes(ICI_NB_PDF_B64);
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();
  const data = app.data || {};

  const setText = (pdfName, val) => {
    if (val === undefined || val === null || val === "") return;
    try {
      const fld = form.getTextField(pdfName);
      fld.setText(String(val));
    } catch (e) { /* field not present; skip */ }
  };

  // 1) Scalar text fields
  Object.entries(PDF_TEXTMAP).forEach(([key, pdfName]) => setText(pdfName, data[key]));

  // 2) Repeat groups
  (data.autos || []).slice(0, PDF_AUTOMAP.length).forEach((row, i) => {
    const m = PDF_AUTOMAP[i];
    Object.entries(m).forEach(([col, pdfName]) => setText(pdfName, row[col]));
  });
  (data.drivers || []).slice(0, PDF_DRIVERMAP.length).forEach((row, i) => {
    const m = PDF_DRIVERMAP[i];
    Object.entries(m).forEach(([col, pdfName]) => setText(pdfName, row[col]));
  });
  (data.wcClasses || []).slice(0, PDF_WCMAP.length).forEach((row, i) => {
    const m = PDF_WCMAP[i];
    Object.entries(m).forEach(([col, pdfName]) => setText(pdfName, row[col]));
  });

  // 3) Checkboxes & radios → draw an "X" at known coordinates (reliable everywhere)
  // checkmap keys are "schemaKey=value". Resolve current value per schema key.
  const drawX = (page, cx, cy) => {
    const p = pages[page - 1];
    if (!p) return;
    p.drawText("X", { x: cx - 3.2, y: cy - 3.6, size: 9, color: rgb(0.05, 0.1, 0.2) });
  };
  // map from schema check/choice keys to their stored data value
  const checkValues = {
    entityType: data.entityType,
    propOccupancy: data.propOccupancy,
    propSprinklered: data.propSprinklered,
    propAlarm: data.propAlarm,
    propFlood: data.propFlood,
    propEarthquake: data.propEarthquake,
    glEbl: data.glEbl,
    autoScheduleAttached: data.autoScheduleAttached,
    wcOwners: data.wcOwners,
    commonOwnership: data.commonOwnership,
    glHiredNonOwned: data.glHiredNonOwned,
    umbrella: data.umbrella,
    epli: data.epli,
    cyber: data.cyber,
    policyDelivery: data.policyDelivery,
  };
  Object.entries(checkValues).forEach(([k, v]) => {
    if (!v) return;
    const hit = PDF_CHECKMAP[k + "=" + v];
    if (hit) drawX(hit.page, hit.cx, hit.cy);
  });

  // Flatten so values are baked in (no editable widgets left)
  try { form.flatten(); } catch (e) { /* ignore */ }

  const out = await pdfDoc.save();
  const blob = new Blob([out], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (app.label || (account && account.name) || "application").replace(/[^a-z0-9]+/gi, "_");
  a.href = url;
  a.download = `ICI_New_Business_${safe}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ════════════════════════════════════════════════════════════════════════
// ACCOUNTS TAB  (businesses we service; contacts roll up under accounts)
// ════════════════════════════════════════════════════════════════════════
function Accounts({ accounts, contacts, persist, goToContacts }) {
  const [selectedId, setSelectedId] = useState(accounts[0]?.id || null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = accounts
    .filter((a) => statusFilter === "All" || a.status === statusFilter)
    .filter((a) => (a.name + " " + (a.industry || "")).toLowerCase().includes(search.toLowerCase()));
  const selected = accounts.find((a) => a.id === selectedId) || filtered[0] || null;

  const saveAccount = (acct) => {
    const exists = accounts.some((a) => a.id === acct.id);
    persist(exists ? accounts.map((a) => (a.id === acct.id ? acct : a)) : [...accounts, acct]);
    setSelectedId(acct.id);
    setEditing(null);
  };
  const deleteAccount = (id) => {
    const next = accounts.filter((a) => a.id !== id);
    persist(next);
    setSelectedId(next[0]?.id || null);
    setEditing(null);
  };
  const saveClaims = (acctId, claims) =>
    persist(accounts.map((a) => (a.id === acctId ? { ...a, claims } : a)));

  // Portfolio metrics
  const clients = accounts.filter((a) => a.status === "Client");
  const totalRev = clients.reduce((s, a) => s + (Number(a.revenue) || 0), 0);
  const totalEmp = clients.reduce((s, a) => s + (Number(a.employees) || 0), 0);
  const openClaims = accounts.reduce(
    (s, a) => s + ((a.claims || []).filter((c) => c.status === "Open").length), 0
  );

  return (
    <>
      <div style={S.metrics}>
        <Metric label="Accounts" value={accounts.length} sub={`${clients.length} clients`} />
        <Metric label="Client revenue" value={fmtMoney(totalRev)} sub="combined book" accent />
        <Metric label="Lives covered" value={totalEmp.toLocaleString("en-US")} sub="across clients" />
        <Metric label="Open claims" value={openClaims} sub="needs attention" />
      </div>

      <div style={S.contactsLayout} className="ici-contacts-layout">
        {/* List pane */}
        <div style={S.listPane} className="ici-list-pane">
          <input
            style={{ ...S.input, marginBottom: 10 }}
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={S.acctFilterRow}>
            {["All", ...ACCOUNT_STATUS].map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                style={{ ...S.acctFilterBtn, ...(statusFilter === f ? S.acctFilterActive : {}) }}
              >
                {f === "Former Client" ? "Former" : f}
              </button>
            ))}
          </div>
          <button className="ici-pri-btn" style={{ ...S.addBtn, width: "100%", margin: "10px 0 12px" }} onClick={() => setEditing({ mode: "add" })}>
            + New account
          </button>
          <div style={S.list}>
            {filtered.length === 0 && <div style={S.empty}>No accounts match.</div>}
            {filtered.map((a) => {
              const people = contacts.filter((c) => c.accountId === a.id || c.company === a.name).length;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  style={{ ...S.listItem, ...(selected && a.id === selected.id ? S.listItemActive : {}) }}
                >
                  <span style={S.listName}>{a.name}</span>
                  <span style={S.listCompany}>{a.industry || "—"}</span>
                  <span style={S.acctRowMeta}>
                    <span style={{ ...S.statusPill, ...statusStyle(a.status) }}>{a.status}</span>
                    <span style={S.listMeta}>{people} contact{people === 1 ? "" : "s"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail pane */}
        <div style={S.detailPane}>
          {!selected ? (
            <div style={{ ...S.empty, padding: 40 }}>Select an account, or add a new one.</div>
          ) : (
            <AccountDetail
              account={selected}
              contacts={contacts.filter((c) => c.accountId === selected.id || c.company === selected.name)}
              onEdit={() => setEditing({ mode: "edit", account: selected })}
              onSaveClaims={(claims) => saveClaims(selected.id, claims)}
              goToContacts={goToContacts}
            />
          )}
        </div>
      </div>

      {editing && (
        <AccountModal
          mode={editing.mode}
          account={editing.account}
          onSave={saveAccount}
          onDelete={deleteAccount}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function AccountDetail({ account, contacts, onEdit, onSaveClaims, goToContacts }) {
  const a = account;
  const isClient = a.status === "Client";
  const renewalDays = a.renewal ? daysFromToday(a.renewal) : null;
  const claims = a.claims || [];
  const totalClaims = claims.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return (
    <div>
      <div style={S.detailHead}>
        <div>
          <h2 style={S.detailName}>{a.name}</h2>
          <div style={S.acctSubRow}>
            <span style={{ ...S.statusPill, ...statusStyle(a.status) }}>{a.status}</span>
            {a.industry && <span style={S.detailCompany}>{a.industry}</span>}
          </div>
        </div>
        <button style={S.editBtn} onClick={onEdit}>Edit</button>
      </div>

      <div style={S.infoGrid}>
        <Info label="Employees" value={a.employees ? Number(a.employees).toLocaleString("en-US") : ""} />
        <Info label="Annual revenue" value={a.revenue ? fmtFull(a.revenue) : ""} />
        <Info
          label="Renewal date"
          value={
            isClient && a.renewal
              ? `${fmtDate(a.renewal)}${renewalDays !== null && renewalDays >= 0 ? ` · in ${renewalDays}d` : renewalDays !== null ? ` · ${Math.abs(renewalDays)}d ago` : ""}`
              : isClient ? "" : "N/A (not a client)"
          }
        />
        <Info label="Lines of business" value={(a.lines || []).join(", ")} />
        <Info label="Address" value={a.address} full />
        <Info label="Notes" value={a.notes} full />
      </div>

      {/* Contacts under this account */}
      <div style={S.sectionHead}>
        <span style={S.sectionTitle}>Contacts ({contacts.length})</span>
        <button style={S.linkBtn} onClick={goToContacts}>Manage in Contacts →</button>
      </div>
      <div style={S.acctContacts}>
        {contacts.length === 0 && <div style={S.empty}>No contacts linked to this account yet.</div>}
        {contacts.map((c) => (
          <div key={c.id} style={S.acctContactRow}>
            <span style={S.acctContactName}>{c.name}</span>
            {c.email && <a href={`mailto:${c.email}`} style={S.acctContactMeta}>{c.email}</a>}
            {c.phone && <span style={S.acctContactMeta}>{c.phone}</span>}
          </div>
        ))}
      </div>

      {/* Past claims — for current client accounts */}
      {isClient ? (
        <ClaimsSection claims={claims} total={totalClaims} onSave={onSaveClaims} />
      ) : (
        <div style={{ ...S.claimsNote }}>
          Claims history appears here once this account becomes a client.
        </div>
      )}
    </div>
  );
}

function ClaimsSection({ claims, total, onSave }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(null);

  const blank = () => ({ id: "cl" + Date.now(), date: todayISO(), type: "Workers Comp", status: "Open", amount: "", desc: "" });
  const startAdd = () => { setForm(blank()); setAdding(true); };
  const startEdit = (c) => { setForm({ ...c }); setAdding(true); };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const commit = () => {
    const exists = claims.some((c) => c.id === form.id);
    const cleaned = { ...form, amount: Number(form.amount) || 0 };
    onSave(exists ? claims.map((c) => (c.id === form.id ? cleaned : c)) : [...claims, cleaned]);
    setAdding(false); setForm(null);
  };
  const remove = (id) => onSave(claims.filter((c) => c.id !== id));

  const sorted = [...claims].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div style={{ marginTop: 6 }}>
      <div style={S.sectionHead}>
        <span style={S.sectionTitle}>
          Past claims ({claims.length}){total > 0 && <span style={S.claimTotal}> · {fmtFull(total)} total</span>}
        </span>
        {!adding && <button style={S.smallAddBtn} onClick={startAdd}>+ Add claim</button>}
      </div>

      {adding && (
        <div style={S.claimForm}>
          <div style={S.claimFormGrid}>
            <label style={S.field}>
              <span style={S.fieldLabel}>Date</span>
              <input style={S.input} type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </label>
            <label style={S.field}>
              <span style={S.fieldLabel}>Type</span>
              <select style={S.input} value={form.type} onChange={(e) => set("type", e.target.value)}>
                {["Workers Comp", "Auto", "Property", "General Liability", "Cyber", "Professional Liability", "Other"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label style={S.field}>
              <span style={S.fieldLabel}>Status</span>
              <select style={S.input} value={form.status} onChange={(e) => set("status", e.target.value)}>
                {["Open", "Closed", "Denied", "Litigation"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label style={S.field}>
              <span style={S.fieldLabel}>Amount ($)</span>
              <input style={S.input} type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
            </label>
          </div>
          <label style={S.field}>
            <span style={S.fieldLabel}>Description</span>
            <textarea style={{ ...S.input, minHeight: 50, resize: "vertical" }} value={form.desc} onChange={(e) => set("desc", e.target.value)} placeholder="What happened, outcome, carrier handling…" />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={S.cancelBtn} onClick={() => { setAdding(false); setForm(null); }}>Cancel</button>
            <button className="ici-pri-btn" style={S.saveBtn} onClick={commit}>Save claim</button>
          </div>
        </div>
      )}

      <div style={S.claimList}>
        {claims.length === 0 && !adding && <div style={S.empty}>No claims on record.</div>}
        {sorted.map((c) => (
          <div key={c.id} style={S.claimRow} className="ici-claim-row">
            <span style={{ ...S.claimStatus, ...claimStatusStyle(c.status) }}>{c.status}</span>
            <div style={S.claimMain}>
              <div style={S.claimTopLine}>
                <span style={S.claimType}>{c.type}</span>
                <span style={S.claimDate}>{fmtDate(c.date)}</span>
                {c.amount > 0 && <span style={S.claimAmount}>{fmtFull(c.amount)}</span>}
              </div>
              {c.desc && <div style={S.claimDesc}>{c.desc}</div>}
            </div>
            <div style={S.claimActions}>
              <button style={S.claimEditBtn} onClick={() => startEdit(c)}>Edit</button>
              <button style={S.activityDel} onClick={() => remove(c.id)} title="Delete">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountModal({ mode, account, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(
    account || {
      id: "ac" + Date.now(),
      name: "", industry: INDUSTRIES[0], status: "Prospect",
      employees: "", revenue: "", renewal: "", address: "",
      lines: [], notes: "", claims: [],
    }
  );
  const ref = useRef(null);
  useEffect(() => ref.current && ref.current.focus(), []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleLine = (l) =>
    setForm((f) => ({ ...f, lines: (f.lines || []).includes(l) ? f.lines.filter((x) => x !== l) : [...(f.lines || []), l] }));
  const valid = form.name.trim().length > 0;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>{mode === "add" ? "New account" : "Edit account"}</div>

        <label style={S.field}>
          <span style={S.fieldLabel}>Business name</span>
          <input ref={ref} style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Company name" />
        </label>

        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Industry</span>
            <select style={S.input} value={form.industry} onChange={(e) => set("industry", e.target.value)}>
              {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Status</span>
            <select style={S.input} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {ACCOUNT_STATUS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Employees</span>
            <input style={S.input} type="number" value={form.employees} onChange={(e) => set("employees", e.target.value)} placeholder="0" />
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Annual revenue ($)</span>
            <input style={S.input} type="number" value={form.revenue} onChange={(e) => set("revenue", e.target.value)} placeholder="0" />
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Renewal date</span>
            <input style={S.input} type="date" value={form.renewal} onChange={(e) => set("renewal", e.target.value)} disabled={form.status === "Prospect"} />
          </label>
        </div>

        <label style={S.field}>
          <span style={S.fieldLabel}>Address</span>
          <input style={S.input} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, City, KS ZIP" />
        </label>

        <div style={S.field}>
          <span style={S.fieldLabel}>Lines of business</span>
          <div style={S.lineChips}>
            {LINES.map((l) => (
              <button
                key={l}
                onClick={() => toggleLine(l)}
                style={{ ...S.lineChip, ...((form.lines || []).includes(l) ? S.lineChipOn : {}) }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <label style={S.field}>
          <span style={S.fieldLabel}>Notes</span>
          <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Account context, exposures, key dates…" />
        </label>

        <div style={S.modalActions}>
          {mode === "edit" ? <button style={S.deleteBtn} onClick={() => onDelete(form.id)}>Delete</button> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button className="ici-pri-btn" style={{ ...S.saveBtn, opacity: valid ? 1 : 0.4, cursor: valid ? "pointer" : "not-allowed" }} disabled={!valid} onClick={() => onSave({ ...form, employees: Number(form.employees) || 0, revenue: Number(form.revenue) || 0 })}>Save account</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function statusStyle(status) {
  if (status === "Client") return { background: "#dcfce7", color: "#15803d" };
  if (status === "Former Client") return { background: "#f1f5f9", color: "#64748b" };
  return { background: "#e3ecfd", color: "#1452d6" }; // Prospect
}
function claimStatusStyle(status) {
  const map = {
    Open: { background: "#fef9c3", color: "#a16207" },
    Closed: { background: "#dcfce7", color: "#15803d" },
    Denied: { background: "#fee2e2", color: "#b91c1c" },
    Litigation: { background: "#f3e8ff", color: "#7c3aed" },
  };
  return map[status] || { background: "#f1f5f9", color: "#64748b" };
}

// ════════════════════════════════════════════════════════════════════════
// PIPELINE TAB
// ════════════════════════════════════════════════════════════════════════
function Pipeline({ deals, persist }) {
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [modal, setModal] = useState(null);

  const moveDeal = (id, stage) => {
    persist(
      deals.map((d) =>
        d.id === id ? { ...d, stage, outcome: stage === "closed" ? (d.outcome || "won") : null } : d
      )
    );
  };

  const saveDeal = (deal) => {
    const exists = deals.some((d) => d.id === deal.id);
    persist(exists ? deals.map((d) => (d.id === deal.id ? deal : d)) : [...deals, deal]);
    setModal(null);
  };
  const deleteDeal = (id) => { persist(deals.filter((d) => d.id !== id)); setModal(null); };

  const open = deals.filter((d) => d.stage !== "closed");
  const openValue = open.reduce((s, d) => s + (Number(d.premium) || 0), 0);
  const won = deals.filter((d) => d.stage === "closed" && d.outcome === "won");
  const wonValue = won.reduce((s, d) => s + (Number(d.premium) || 0), 0);
  const closedTotal = deals.filter((d) => d.stage === "closed").length;
  const winRate = closedTotal ? Math.round((won.length / closedTotal) * 100) : 0;

  return (
    <>
      <div style={S.actionRow}>
        <button className="ici-pri-btn" style={S.addBtn} onClick={() => setModal({ mode: "add" })}>+ New deal</button>
      </div>

      <div style={S.metrics}>
        <Metric label="Open deals" value={open.length} sub={fmtFull(openValue) + " in premium"} />
        <Metric label="Won" value={won.length} sub={fmtFull(wonValue) + " booked"} accent />
        <Metric label="Win rate" value={winRate + "%"} sub={closedTotal + " closed"} />
        <Metric label="Total deals" value={deals.length} sub="across all stages" />
      </div>

      <div style={S.board} className="ici-board">
        {STAGES.map((stage) => {
          const col = deals.filter((d) => d.stage === stage.id);
          const colValue = col.reduce((s, d) => s + (Number(d.premium) || 0), 0);
          const isOver = overStage === stage.id;
          return (
            <div
              key={stage.id}
              className="ici-col"
              style={{ ...S.col, ...(isOver ? S.colOver : {}) }}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage.id); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOverStage(null); }}
              onDrop={() => { if (dragId) moveDeal(dragId, stage.id); setDragId(null); setOverStage(null); }}
            >
              <div style={S.colHead}>
                <div style={S.colTitleRow}>
                  <span style={S.colTitle}>{stage.label}</span>
                  <span style={S.colCount}>{col.length}</span>
                </div>
                <div style={S.colHint}>{stage.hint}</div>
                <div style={S.colValue}>{fmtFull(colValue)}</div>
              </div>
              <div style={S.cards}>
                {col.length === 0 && <div style={S.empty}>Drop a deal here</div>}
                {col.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    dragging={dragId === d.id}
                    onDragStart={() => setDragId(d.id)}
                    onDragEnd={() => { setDragId(null); setOverStage(null); }}
                    onClick={() => setModal({ mode: "edit", deal: d })}
                    onToggleOutcome={(outcome) =>
                      persist(deals.map((x) => (x.id === d.id ? { ...x, outcome } : x)))
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <DealModal
          mode={modal.mode}
          deal={modal.deal}
          onSave={saveDeal}
          onDelete={deleteDeal}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function DealCard({ deal, dragging, onDragStart, onDragEnd, onClick, onToggleOutcome }) {
  const isClosed = deal.stage === "closed";
  return (
    <div
      className="ici-card"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{ ...S.card, ...(dragging ? S.cardDragging : {}) }}
    >
      <div style={S.cardTop}>
        <span style={S.cardClient}>{deal.client}</span>
        <span style={S.cardPremium}>{fmtMoney(Number(deal.premium) || 0)}</span>
      </div>
      <div style={S.cardLine}>{deal.line}</div>
      {deal.note && <div style={S.cardNote}>{deal.note}</div>}
      {isClosed && (
        <div style={S.outcomeRow} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onToggleOutcome("won")} style={{ ...S.outcomeBtn, ...(deal.outcome === "won" ? S.wonActive : {}) }}>Won</button>
          <button onClick={() => onToggleOutcome("lost")} style={{ ...S.outcomeBtn, ...(deal.outcome === "lost" ? S.lostActive : {}) }}>Lost</button>
        </div>
      )}
    </div>
  );
}

function DealModal({ mode, deal, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(
    deal || { id: "d" + Date.now(), client: "", line: LINES[0], premium: "", stage: "prospecting", outcome: null, owner: "You", note: "" }
  );
  const ref = useRef(null);
  useEffect(() => ref.current && ref.current.focus(), []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.client.trim().length > 0;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>{mode === "add" ? "New deal" : "Edit deal"}</div>
        <label style={S.field}>
          <span style={S.fieldLabel}>Client</span>
          <input ref={ref} style={S.input} value={form.client} onChange={(e) => set("client", e.target.value)} placeholder="Client name" />
        </label>
        <label style={S.field}>
          <span style={S.fieldLabel}>Line of business</span>
          <select style={S.input} value={form.line} onChange={(e) => set("line", e.target.value)}>
            {LINES.map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Annual premium ($)</span>
            <input style={S.input} type="number" value={form.premium} onChange={(e) => set("premium", e.target.value)} placeholder="0" />
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Stage</span>
            <select style={S.input} value={form.stage} onChange={(e) => set("stage", e.target.value)}>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <label style={S.field}>
          <span style={S.fieldLabel}>Note</span>
          <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Context, next step, carrier notes…" />
        </label>
        <div style={S.modalActions}>
          {mode === "edit" ? <button style={S.deleteBtn} onClick={() => onDelete(form.id)}>Delete</button> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={{ ...S.saveBtn, opacity: valid ? 1 : 0.4, cursor: valid ? "pointer" : "not-allowed" }} disabled={!valid} onClick={() => onSave({ ...form, premium: Number(form.premium) || 0 })}>Save deal</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// CONTACTS TAB
// ════════════════════════════════════════════════════════════════════════
function Contacts({ contacts, accounts, persist }) {
  const [selectedId, setSelectedId] = useState(contacts[0]?.id || null);
  const [editing, setEditing] = useState(null); // contact being edited in modal
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((c) =>
    (c.name + " " + c.company).toLowerCase().includes(search.toLowerCase())
  );
  const selected = contacts.find((c) => c.id === selectedId) || filtered[0] || null;

  const saveContact = (contact) => {
    const exists = contacts.some((c) => c.id === contact.id);
    persist(exists ? contacts.map((c) => (c.id === contact.id ? contact : c)) : [...contacts, contact]);
    setSelectedId(contact.id);
    setEditing(null);
  };
  const deleteContact = (id) => {
    const next = contacts.filter((c) => c.id !== id);
    persist(next);
    setSelectedId(next[0]?.id || null);
    setEditing(null);
  };

  const addActivity = (contactId, activity) => {
    persist(
      contacts.map((c) =>
        c.id === contactId ? { ...c, activities: [activity, ...(c.activities || [])] } : c
      )
    );
  };
  const deleteActivity = (contactId, activityId) => {
    persist(
      contacts.map((c) =>
        c.id === contactId ? { ...c, activities: (c.activities || []).filter((a) => a.id !== activityId) } : c
      )
    );
  };

  return (
    <div style={S.contactsLayout} className="ici-contacts-layout">
      {/* List pane */}
      <div style={S.listPane} className="ici-list-pane">
        <input
          style={{ ...S.input, marginBottom: 10 }}
          placeholder="Search contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="ici-pri-btn" style={{ ...S.addBtn, width: "100%", marginBottom: 12 }} onClick={() => setEditing({ mode: "add" })}>
          + New contact
        </button>
        <div style={S.list}>
          {filtered.length === 0 && <div style={S.empty}>No contacts match.</div>}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              style={{ ...S.listItem, ...(selected && c.id === selected.id ? S.listItemActive : {}) }}
            >
              <span style={S.listName}>{c.name}</span>
              <span style={S.listCompany}>{c.company}</span>
              <span style={S.listMeta}>{(c.activities || []).length} activities</span>
            </button>
          ))}
        </div>
      </div>

      {/* Detail pane */}
      <div style={S.detailPane}>
        {!selected ? (
          <div style={{ ...S.empty, padding: 40 }}>Select a contact, or add a new one.</div>
        ) : (
          <ContactDetail
            contact={selected}
            onEdit={() => setEditing({ mode: "edit", contact: selected })}
            onAddActivity={(a) => addActivity(selected.id, a)}
            onDeleteActivity={(aid) => deleteActivity(selected.id, aid)}
          />
        )}
      </div>

      {editing && (
        <ContactModal
          mode={editing.mode}
          contact={editing.contact}
          accounts={accounts}
          onSave={saveContact}
          onDelete={deleteContact}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ContactDetail({ contact, onEdit, onAddActivity, onDeleteActivity }) {
  const [type, setType] = useState(ACTIVITY_TYPES[0]);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  const logActivity = () => {
    onAddActivity({ id: "a" + Date.now(), type, date, note: note.trim() });
    setNote("");
    setType(ACTIVITY_TYPES[0]);
    setDate(todayISO());
  };

  const activities = contact.activities || [];

  return (
    <div>
      <div style={S.detailHead}>
        <div>
          <h2 style={S.detailName}>{contact.name}</h2>
          <div style={S.detailCompany}>{contact.company}</div>
        </div>
        <button style={S.editBtn} onClick={onEdit}>Edit</button>
      </div>

      <div style={S.infoGrid}>
        <Info label="Email" value={contact.email} link={contact.email ? `mailto:${contact.email}` : null} />
        <Info label="Phone" value={contact.phone} link={contact.phone ? `tel:${contact.phone}` : null} />
        <Info label="Address" value={contact.address} full />
        <Info label="Details" value={contact.details} full />
      </div>

      {/* Activity logger */}
      <div style={S.logBox}>
        <div style={S.logTitle}>Log activity</div>
        <div style={S.logForm} className="ici-log-form">
          <select style={{ ...S.input, flex: "0 0 150px" }} value={type} onChange={(e) => setType(e.target.value)}>
            {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input style={{ ...S.input, flex: "0 0 140px" }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input style={{ ...S.input, flex: 1, minWidth: 140 }} placeholder="What happened?" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && logActivity()} />
          <button className="ici-pri-btn" style={S.logBtn} onClick={logActivity}>Log</button>
        </div>
      </div>

      {/* Activity timeline */}
      <div style={S.timelineTitle}>Activity history</div>
      <div style={S.timeline}>
        {activities.length === 0 && <div style={S.empty}>No activity logged yet.</div>}
        {activities.map((a) => (
          <div key={a.id} style={S.activityRow} className="ici-activity-row">
            <span style={S.activityType}>{a.type}</span>
            <span style={S.activityDate}>{fmtDate(a.date)}</span>
            <span style={S.activityNote}>{a.note || "—"}</span>
            <button style={S.activityDel} onClick={() => onDeleteActivity(a.id)} title="Delete">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Info({ label, value, link, full }) {
  return (
    <div style={{ ...S.infoCell, gridColumn: full ? "1 / -1" : "auto" }}>
      <div style={S.infoLabel}>{label}</div>
      {value ? (
        link ? <a href={link} style={S.infoLink}>{value}</a> : <div style={S.infoValue}>{value}</div>
      ) : (
        <div style={{ ...S.infoValue, color: FAINT }}>—</div>
      )}
    </div>
  );
}

function ContactModal({ mode, contact, accounts, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(
    contact || { id: "c" + Date.now(), name: "", company: "", accountId: "", email: "", phone: "", address: "", details: "", activities: [] }
  );
  const ref = useRef(null);
  useEffect(() => ref.current && ref.current.focus(), []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const acctList = accounts || [];
  // Selecting an account keeps company text in sync for the rollup.
  const onAccountChange = (id) => {
    const acct = acctList.find((a) => a.id === id);
    setForm((f) => ({ ...f, accountId: id, company: acct ? acct.name : f.company }));
  };
  const valid = form.name.trim().length > 0;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>{mode === "add" ? "New contact" : "Edit contact"}</div>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Name</span>
            <input ref={ref} style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" />
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Account</span>
            <select style={S.input} value={form.accountId || ""} onChange={(e) => onAccountChange(e.target.value)}>
              <option value="">— No account —</option>
              {acctList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        {!form.accountId && (
          <label style={S.field}>
            <span style={S.fieldLabel}>Company (if no account)</span>
            <input style={S.input} value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" />
          </label>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Email</span>
            <input style={S.input} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" />
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Phone</span>
            <input style={S.input} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(316) 555-0100" />
          </label>
        </div>
        <label style={S.field}>
          <span style={S.fieldLabel}>Address</span>
          <input style={S.input} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, City, KS ZIP" />
        </label>
        <label style={S.field}>
          <span style={S.fieldLabel}>Details</span>
          <textarea style={{ ...S.input, minHeight: 70, resize: "vertical" }} value={form.details} onChange={(e) => set("details", e.target.value)} placeholder="Role, preferences, renewal dates, household notes…" />
        </label>
        <div style={S.modalActions}>
          {mode === "edit" ? <button style={S.deleteBtn} onClick={() => onDelete(form.id)}>Delete</button> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button className="ici-pri-btn" style={{ ...S.saveBtn, opacity: valid ? 1 : 0.4, cursor: valid ? "pointer" : "not-allowed" }} disabled={!valid} onClick={() => onSave(form)}>Save contact</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// CALENDAR TAB  (month view; two-way task sync + standalone events)
// ════════════════════════════════════════════════════════════════════════

// Date helpers (local, no TZ surprises since we work in YYYY-MM-DD strings)
const isoOf = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};

function eventTypeColor(type) {
  const map = {
    Meeting: "#1452d6",
    Appointment: "#0891b2",
    Reminder: "#d97706",
    Personal: "#7c3aed",
    Renewal: "#16a34a",
    Other: "#64748b",
  };
  return map[type] || "#64748b";
}

function Calendar({ events, tasks, accounts, contacts, deals, persistEvents, persistTasks }) {
  const today = new Date(todayISO() + "T00:00:00");
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [eventModal, setEventModal] = useState(null); // {mode, event}
  const [taskModal, setTaskModal] = useState(null);    // {task}
  const [dragItem, setDragItem] = useState(null);      // {kind:'task'|'event', id}

  // Build the month grid (6 weeks × 7 days)
  const first = new Date(cursor.y, cursor.m, 1);
  const startDow = first.getDay();
  const gridStart = new Date(cursor.y, cursor.m, 1 - startDow);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }

  // Merge tasks + events into per-day buckets keyed by ISO date
  const byDay = {};
  const push = (iso, item) => { (byDay[iso] = byDay[iso] || []).push(item); };
  tasks.forEach((t) => {
    if (t.due) push(t.due, { kind: "task", id: t.id, ref: t });
  });
  events.forEach((e) => {
    if (e.date) push(e.date, { kind: "event", id: e.id, ref: e });
  });
  // sort each day: timed events first by start, then tasks
  Object.values(byDay).forEach((arr) =>
    arr.sort((a, b) => {
      const at = a.kind === "event" ? (a.ref.start || "99:99") : "98:98";
      const bt = b.kind === "event" ? (b.ref.start || "99:99") : "98:98";
      return at.localeCompare(bt);
    })
  );

  const move = (dir) => {
    let m = cursor.m + dir, y = cursor.y;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCursor({ y, m });
  };
  const goToday = () => {
    setCursor({ y: today.getFullYear(), m: today.getMonth() });
    setSelectedDay(todayISO());
  };

  // Drag-to-reschedule
  const onDropDay = (iso) => {
    if (!dragItem) return;
    if (dragItem.kind === "task") {
      persistTasks(tasks.map((t) => (t.id === dragItem.id ? { ...t, due: iso } : t)));
    } else {
      persistEvents(events.map((e) => (e.id === dragItem.id ? { ...e, date: iso } : e)));
    }
    setDragItem(null);
  };

  const saveEvent = (ev) => {
    const exists = events.some((e) => e.id === ev.id);
    persistEvents(exists ? events.map((e) => (e.id === ev.id ? ev : e)) : [...events, ev]);
    setEventModal(null);
  };
  const deleteEvent = (id) => { persistEvents(events.filter((e) => e.id !== id)); setEventModal(null); };

  const saveTask = (task) => {
    persistTasks(tasks.map((t) => (t.id === task.id ? task : t)));
    setTaskModal(null);
  };
  const toggleTaskDone = (id) =>
    persistTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const dayItems = byDay[selectedDay] || [];

  return (
    <>
      {/* Toolbar */}
      <div style={S.calToolbar}>
        <div style={S.calNav}>
          <button style={S.calNavBtn} onClick={() => move(-1)}>‹</button>
          <span style={S.calMonthLabel}>{MONTHS[cursor.m]} {cursor.y}</span>
          <button style={S.calNavBtn} onClick={() => move(1)}>›</button>
          <button style={S.calTodayBtn} onClick={goToday}>Today</button>
        </div>
        <div style={S.calLegend}>
          <LegendDot color="#1452d6" label="Events" />
          <LegendDot color="#16a34a" label="Tasks" />
          <button className="ici-pri-btn" style={S.addBtn} onClick={() => setEventModal({ mode: "add", preset: { date: selectedDay } })}>+ New event</button>
        </div>
      </div>

      <div style={S.calLayout} className="ici-cal-layout">
        {/* Month grid */}
        <div style={S.calGridWrap}>
          <div style={S.calWeekHead}>
            {WEEKDAYS.map((w) => <div key={w} style={S.calWeekCell}>{w}</div>)}
          </div>
          <div style={S.calGrid}>
            {cells.map((d, i) => {
              const iso = isoOf(d.getFullYear(), d.getMonth(), d.getDate());
              const inMonth = d.getMonth() === cursor.m;
              const isToday = iso === todayISO();
              const isSel = iso === selectedDay;
              const items = byDay[iso] || [];
              return (
                <div
                  key={i}
                  className="ici-cal-cell"
                  style={{
                    ...S.calCell,
                    ...(inMonth ? {} : S.calCellOut),
                    ...(isSel ? S.calCellSel : {}),
                  }}
                  onClick={() => setSelectedDay(iso)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropDay(iso)}
                >
                  <div style={S.calCellHead}>
                    <span style={{ ...S.calDayNum, ...(isToday ? S.calToday : {}) }}>{d.getDate()}</span>
                  </div>
                  <div style={S.calChips}>
                    {items.slice(0, 3).map((it) => (
                      <div
                        key={it.kind + it.id}
                        draggable
                        onDragStart={() => setDragItem({ kind: it.kind, id: it.id })}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (it.kind === "event") setEventModal({ mode: "edit", event: it.ref });
                          else setTaskModal({ task: it.ref });
                        }}
                        title={it.kind === "event" ? it.ref.title : it.ref.title}
                        style={{
                          ...S.calChip,
                          background: it.kind === "event" ? eventTypeColor(it.ref.type) : "#16a34a",
                          ...(it.kind === "task" && it.ref.done ? { opacity: 0.45, textDecoration: "line-through" } : {}),
                        }}
                      >
                        {it.kind === "event" && it.ref.start ? fmtTime(it.ref.start).replace(":00", "") + " " : ""}
                        {it.ref.title}
                      </div>
                    ))}
                    {items.length > 3 && <div style={S.calMore}>+{items.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day detail panel */}
        <div style={S.calDayPanel}>
          <div style={S.calDayPanelHead}>
            <div>
              <div style={S.calDayPanelDate}>{fmtDate(selectedDay)}</div>
              <div style={S.calDayPanelSub}>{dayItems.length} item{dayItems.length === 1 ? "" : "s"}</div>
            </div>
            <button style={S.smallAddBtn} onClick={() => setEventModal({ mode: "add", preset: { date: selectedDay } })}>+ Event</button>
          </div>

          <div style={S.calDayList}>
            {dayItems.length === 0 && <div style={S.empty}>Nothing scheduled. Add an event, or drag a task here.</div>}
            {dayItems.map((it) =>
              it.kind === "event" ? (
                <div key={"e" + it.id} style={S.calDayItem} className="ici-cal-item" onClick={() => setEventModal({ mode: "edit", event: it.ref })}>
                  <span style={{ ...S.calItemBar, background: eventTypeColor(it.ref.type) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.calItemTitle}>{it.ref.title}</div>
                    <div style={S.calItemMeta}>
                      {it.ref.start ? `${fmtTime(it.ref.start)}${it.ref.end ? "–" + fmtTime(it.ref.end) : ""} · ` : ""}
                      {it.ref.type}
                      {linkName(it.ref, accounts, contacts) ? " · " + linkName(it.ref, accounts, contacts) : ""}
                    </div>
                    {it.ref.notes && <div style={S.calItemNotes}>{it.ref.notes}</div>}
                  </div>
                </div>
              ) : (
                <div key={"t" + it.id} style={S.calDayItem} className="ici-cal-item">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTaskDone(it.id); }}
                    style={{ ...S.check, ...(it.ref.done ? S.checkOn : {}) }}
                    title={it.ref.done ? "Mark not done" : "Mark done"}
                  >{it.ref.done ? "✓" : ""}</button>
                  <span style={{ ...S.calItemBar, background: "#16a34a" }} />
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setTaskModal({ task: it.ref })}>
                    <div style={{ ...S.calItemTitle, ...(it.ref.done ? { textDecoration: "line-through", color: FAINT } : {}) }}>
                      {it.ref.title}
                    </div>
                    <div style={S.calItemMeta}>
                      Task · {it.ref.type}
                      {taskLinkName(it.ref, deals, contacts) ? " · " + taskLinkName(it.ref, deals, contacts) : ""}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {eventModal && (
        <EventModal
          mode={eventModal.mode}
          event={eventModal.event}
          preset={eventModal.preset}
          accounts={accounts}
          contacts={contacts}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => setEventModal(null)}
        />
      )}
      {taskModal && (
        <CalTaskModal
          task={taskModal.task}
          deals={deals}
          contacts={contacts}
          onSave={saveTask}
          onClose={() => setTaskModal(null)}
        />
      )}
    </>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={S.legendItem}>
      <span style={{ ...S.legendDot, background: color }} />
      {label}
    </span>
  );
}

function linkName(ev, accounts, contacts) {
  if (ev.linkType === "account") { const a = accounts.find((x) => x.id === ev.linkId); return a ? a.name : ""; }
  if (ev.linkType === "contact") { const c = contacts.find((x) => x.id === ev.linkId); return c ? c.name : ""; }
  return "";
}
function taskLinkName(t, deals, contacts) {
  if (t.linkType === "deal") { const d = deals.find((x) => x.id === t.linkId); return d ? d.client : ""; }
  if (t.linkType === "contact") { const c = contacts.find((x) => x.id === t.linkId); return c ? c.name : ""; }
  return "";
}

function EventModal({ mode, event, preset, accounts, contacts, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(
    event || {
      id: "e" + Date.now(),
      title: "",
      date: (preset && preset.date) || todayISO(),
      start: "",
      end: "",
      type: EVENT_TYPES[0],
      notes: "",
      linkType: "none",
      linkId: "",
    }
  );
  const ref = useRef(null);
  useEffect(() => ref.current && ref.current.focus(), []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.title.trim().length > 0 && form.date;
  const linkOptions =
    form.linkType === "account" ? accounts.map((a) => ({ id: a.id, label: a.name }))
    : form.linkType === "contact" ? contacts.map((c) => ({ id: c.id, label: `${c.name}${c.company ? " — " + c.company : ""}` }))
    : [];

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>{mode === "add" ? "New event" : "Edit event"}</div>

        <label style={S.field}>
          <span style={S.fieldLabel}>Title</span>
          <input ref={ref} style={S.input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Renewal meeting" />
        </label>

        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1.2 }}>
            <span style={S.fieldLabel}>Date</span>
            <input style={S.input} type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Start</span>
            <input style={S.input} type="time" value={form.start} onChange={(e) => set("start", e.target.value)} />
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>End</span>
            <input style={S.input} type="time" value={form.end} onChange={(e) => set("end", e.target.value)} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Type</span>
            <select style={S.input} value={form.type} onChange={(e) => set("type", e.target.value)}>
              {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Link to</span>
            <select style={S.input} value={form.linkType} onChange={(e) => { set("linkType", e.target.value); set("linkId", ""); }}>
              <option value="none">Nothing</option>
              <option value="account">An account</option>
              <option value="contact">A contact</option>
            </select>
          </label>
          <label style={{ ...S.field, flex: 1.4 }}>
            <span style={S.fieldLabel}>{form.linkType === "none" ? "—" : form.linkType === "account" ? "Account" : "Contact"}</span>
            <select style={{ ...S.input, opacity: form.linkType === "none" ? 0.4 : 1 }} disabled={form.linkType === "none"} value={form.linkId} onChange={(e) => set("linkId", e.target.value)}>
              <option value="">{form.linkType === "none" ? "—" : "Select…"}</option>
              {linkOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <label style={S.field}>
          <span style={S.fieldLabel}>Notes</span>
          <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Agenda, location, details…" />
        </label>

        <div style={S.modalActions}>
          {mode === "edit" ? <button style={S.deleteBtn} onClick={() => onDelete(form.id)}>Delete</button> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button className="ici-pri-btn" style={{ ...S.saveBtn, opacity: valid ? 1 : 0.4, cursor: valid ? "pointer" : "not-allowed" }} disabled={!valid} onClick={() => onSave(form)}>Save event</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Task editor reachable from the calendar (two-way sync)
function CalTaskModal({ task, deals, contacts, onSave, onClose }) {
  const [form, setForm] = useState({ ...task });
  const ref = useRef(null);
  useEffect(() => ref.current && ref.current.focus(), []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = (form.title || "").trim().length > 0;
  const linkOptions =
    form.linkType === "deal" ? deals.map((d) => ({ id: d.id, label: d.client }))
    : form.linkType === "contact" ? contacts.map((c) => ({ id: c.id, label: `${c.name}${c.company ? " — " + c.company : ""}` }))
    : [];

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>Edit task</div>
        <div style={S.calTaskBanner}>This is a task — changes sync with the Tasks tab.</div>

        <label style={S.field}>
          <span style={S.fieldLabel}>Task</span>
          <input ref={ref} style={S.input} value={form.title || ""} onChange={(e) => set("title", e.target.value)} />
        </label>

        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Type</span>
            <select style={S.input} value={form.type} onChange={(e) => set("type", e.target.value)}>
              {TASK_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Due date</span>
            <input style={S.input} type="date" value={form.due || ""} onChange={(e) => set("due", e.target.value)} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Link to</span>
            <select style={S.input} value={form.linkType} onChange={(e) => { set("linkType", e.target.value); set("linkId", ""); }}>
              <option value="none">Nothing</option>
              <option value="deal">A deal</option>
              <option value="contact">A contact</option>
            </select>
          </label>
          <label style={{ ...S.field, flex: 1.4 }}>
            <span style={S.fieldLabel}>{form.linkType === "none" ? "—" : form.linkType === "deal" ? "Deal" : "Contact"}</span>
            <select style={{ ...S.input, opacity: form.linkType === "none" ? 0.4 : 1 }} disabled={form.linkType === "none"} value={form.linkId} onChange={(e) => set("linkId", e.target.value)}>
              <option value="">{form.linkType === "none" ? "—" : "Select…"}</option>
              {linkOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <div style={S.calDoneRow}>
          <button onClick={() => set("done", !form.done)} style={{ ...S.check, ...(form.done ? S.checkOn : {}) }}>{form.done ? "✓" : ""}</button>
          <span style={S.calDoneLabel}>{form.done ? "Completed" : "Mark complete"}</span>
        </div>

        <div style={S.modalActions}>
          <span />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button className="ici-pri-btn" style={{ ...S.saveBtn, opacity: valid ? 1 : 0.4, cursor: valid ? "pointer" : "not-allowed" }} disabled={!valid} onClick={() => onSave(form)}>Save task</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TASKS TAB
// ════════════════════════════════════════════════════════════════════════
function Tasks({ tasks, deals, contacts, persist, goTo }) {
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("open"); // open | all | done

  const linkLabel = (t) => {
    if (t.linkType === "deal") {
      const d = deals.find((x) => x.id === t.linkId);
      return d ? d.client : "(deal removed)";
    }
    if (t.linkType === "contact") {
      const c = contacts.find((x) => x.id === t.linkId);
      return c ? c.name : "(contact removed)";
    }
    return null;
  };

  const toggleDone = (id) =>
    persist(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const saveTask = (task) => {
    const exists = tasks.some((t) => t.id === task.id);
    persist(exists ? tasks.map((t) => (t.id === task.id ? task : t)) : [...tasks, task]);
    setModal(null);
  };
  const deleteTask = (id) => { persist(tasks.filter((t) => t.id !== id)); setModal(null); };

  // ── Reminders / leakage detection ──────────────────────────────────
  const openTasks = tasks.filter((t) => !t.done);
  const overdue = openTasks
    .filter((t) => t.due && daysFromToday(t.due) < 0)
    .sort((a, b) => a.due.localeCompare(b.due));
  const dueToday = openTasks.filter((t) => t.due && daysFromToday(t.due) === 0);
  const dueSoon = openTasks
    .filter((t) => t.due && daysFromToday(t.due) > 0 && daysFromToday(t.due) <= 3)
    .sort((a, b) => a.due.localeCompare(b.due));

  // Leakage: open deals (not closed) that are stale AND have no open task.
  const dealsWithOpenTask = new Set(
    openTasks.filter((t) => t.linkType === "deal").map((t) => t.linkId)
  );
  const leakage = deals
    .filter((d) => d.stage !== "closed")
    .map((d) => {
      const contact = contacts.find((c) => c.company === d.client || c.name === d.client);
      const last = lastActivityDate(contact);
      const sinceActivity = last ? -daysFromToday(last) : null;
      const threshold = STALE_THRESHOLDS[d.stage] || 10;
      const noTask = !dealsWithOpenTask.has(d.id);
      const stale = sinceActivity === null || sinceActivity >= threshold;
      return { deal: d, sinceActivity, threshold, noTask, stale };
    })
    .filter((x) => x.noTask && x.stale)
    .sort((a, b) => (b.sinceActivity || 999) - (a.sinceActivity || 999));

  const visible = tasks
    .filter((t) => (filter === "all" ? true : filter === "done" ? t.done : !t.done))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.due || "9999").localeCompare(b.due || "9999");
    });

  const hasReminders = overdue.length || dueToday.length || dueSoon.length || leakage.length;

  return (
    <>
      {/* ── Reminders / leakage prevention ── */}
      <div style={S.reminderWrap}>
        <div style={S.reminderHead}>
          <span style={S.reminderTitle}>Reminders &amp; leakage prevention</span>
          <span style={S.reminderSub}>Auto-generated from due dates and pipeline activity</span>
        </div>

        {!hasReminders && (
          <div style={S.allClear}>Nothing slipping. Every open deal has a next step and no tasks are overdue.</div>
        )}

        <div style={S.reminderGrid} className="ici-reminder-grid">
          {overdue.length > 0 && (
            <ReminderCard tone="overdue" title={`Overdue (${overdue.length})`}>
              {overdue.map((t) => (
                <ReminderLine key={t.id} onClick={() => setModal({ mode: "edit", task: t })}>
                  <b>{t.type}</b> · {t.title}
                  <span style={S.reminderWhen}>{Math.abs(daysFromToday(t.due))}d late</span>
                </ReminderLine>
              ))}
            </ReminderCard>
          )}

          {dueToday.length > 0 && (
            <ReminderCard tone="today" title={`Due today (${dueToday.length})`}>
              {dueToday.map((t) => (
                <ReminderLine key={t.id} onClick={() => setModal({ mode: "edit", task: t })}>
                  <b>{t.type}</b> · {t.title}
                </ReminderLine>
              ))}
            </ReminderCard>
          )}

          {dueSoon.length > 0 && (
            <ReminderCard tone="soon" title={`Due soon (${dueSoon.length})`}>
              {dueSoon.map((t) => (
                <ReminderLine key={t.id} onClick={() => setModal({ mode: "edit", task: t })}>
                  <b>{t.type}</b> · {t.title}
                  <span style={S.reminderWhen}>{fmtDate(t.due)}</span>
                </ReminderLine>
              ))}
            </ReminderCard>
          )}

          {leakage.length > 0 && (
            <ReminderCard tone="leak" title={`Pipeline leakage (${leakage.length})`}>
              {leakage.map((x) => (
                <ReminderLine
                  key={x.deal.id}
                  onClick={() =>
                    setModal({
                      mode: "add",
                      preset: { linkType: "deal", linkId: x.deal.id, title: `Follow up: ${x.deal.client}` },
                    })
                  }
                >
                  <b>{x.deal.client}</b> · {STAGES.find((s) => s.id === x.deal.stage)?.label}
                  <span style={S.reminderWhen}>
                    {x.sinceActivity === null ? "no activity" : `${x.sinceActivity}d quiet`} · no task
                  </span>
                </ReminderLine>
              ))}
              <div style={S.leakHint}>Click a deal to schedule a follow-up before it goes cold.</div>
            </ReminderCard>
          )}
        </div>
      </div>

      {/* ── Task list ── */}
      <div style={S.taskBar}>
        <div style={S.filterRow}>
          {["open", "all", "done"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ ...S.filterBtn, ...(filter === f ? S.filterActive : {}) }}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button className="ici-pri-btn" style={S.addBtn} onClick={() => setModal({ mode: "add" })}>+ New task</button>
      </div>

      <div style={S.taskList}>
        {visible.length === 0 && <div style={{ ...S.empty, padding: 24 }}>No tasks here.</div>}
        {visible.map((t) => {
          const dd = t.due ? daysFromToday(t.due) : null;
          const late = !t.done && dd !== null && dd < 0;
          const today = !t.done && dd === 0;
          return (
            <div key={t.id} style={{ ...S.taskRow, ...(t.done ? S.taskDone : {}) }} className="ici-task-row">
              <button
                onClick={() => toggleDone(t.id)}
                style={{ ...S.check, ...(t.done ? S.checkOn : {}) }}
                title={t.done ? "Mark not done" : "Mark done"}
              >
                {t.done ? "✓" : ""}
              </button>
              <span style={{ ...S.taskType, ...(typeColor(t.type)) }}>{t.type}</span>
              <span style={{ ...S.taskTitle, ...(t.done ? { textDecoration: "line-through", color: FAINT } : {}) }}>
                {t.title}
                {linkLabel(t) && <span style={S.taskLink}> · {linkLabel(t)}</span>}
              </span>
              <span style={{ ...S.taskDue, ...(late ? { color: "#dc2626", fontWeight: 700 } : today ? { color: "#b07d2b", fontWeight: 700 } : {}) }}>
                {t.due ? (late ? `${Math.abs(dd)}d late` : today ? "Today" : fmtDate(t.due)) : "No date"}
              </span>
              <button style={S.taskEdit} onClick={() => setModal({ mode: "edit", task: t })}>Edit</button>
            </div>
          );
        })}
      </div>

      {modal && (
        <TaskModal
          mode={modal.mode}
          task={modal.task}
          preset={modal.preset}
          deals={deals}
          contacts={contacts}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function ReminderCard({ tone, title, children }) {
  return (
    <div style={{ ...S.remCard, ...REM_TONE[tone] }}>
      <div style={{ ...S.remCardTitle, color: REM_TONE[tone].borderColor }}>{title}</div>
      <div style={S.remCardBody}>{children}</div>
    </div>
  );
}
function ReminderLine({ children, onClick }) {
  return (
    <button onClick={onClick} style={S.remLine} className="ici-rem-line">
      {children}
    </button>
  );
}

function TaskModal({ mode, task, preset, deals, contacts, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(
    task || {
      id: "t" + Date.now(),
      type: TASK_TYPES[0],
      title: preset?.title || "",
      due: todayISO(),
      linkType: preset?.linkType || "none",
      linkId: preset?.linkId || "",
      done: false,
    }
  );
  const ref = useRef(null);
  useEffect(() => ref.current && ref.current.focus(), []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.title.trim().length > 0;

  const linkOptions =
    form.linkType === "deal" ? deals.map((d) => ({ id: d.id, label: d.client }))
    : form.linkType === "contact" ? contacts.map((c) => ({ id: c.id, label: `${c.name} — ${c.company}` }))
    : [];

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>{mode === "add" ? "New task" : "Edit task"}</div>

        <label style={S.field}>
          <span style={S.fieldLabel}>Task</span>
          <input ref={ref} style={S.input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Call about renewal" />
        </label>

        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Type</span>
            <select style={S.input} value={form.type} onChange={(e) => set("type", e.target.value)}>
              {TASK_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Due date</span>
            <input style={S.input} type="date" value={form.due} onChange={(e) => set("due", e.target.value)} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...S.field, flex: 1 }}>
            <span style={S.fieldLabel}>Link to</span>
            <select style={S.input} value={form.linkType} onChange={(e) => { set("linkType", e.target.value); set("linkId", ""); }}>
              <option value="none">Nothing</option>
              <option value="deal">A deal</option>
              <option value="contact">A contact</option>
            </select>
          </label>
          <label style={{ ...S.field, flex: 1.4 }}>
            <span style={S.fieldLabel}>{form.linkType === "none" ? "—" : form.linkType === "deal" ? "Deal" : "Contact"}</span>
            <select style={{ ...S.input, opacity: form.linkType === "none" ? 0.4 : 1 }} disabled={form.linkType === "none"} value={form.linkId} onChange={(e) => set("linkId", e.target.value)}>
              <option value="">{form.linkType === "none" ? "—" : "Select…"}</option>
              {linkOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <div style={S.modalActions}>
          {mode === "edit" ? <button style={S.deleteBtn} onClick={() => onDelete(form.id)}>Delete</button> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={{ ...S.saveBtn, opacity: valid ? 1 : 0.4, cursor: valid ? "pointer" : "not-allowed" }} disabled={!valid} onClick={() => onSave(form)}>Save task</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function typeColor(type) {
  const map = {
    Call: { background: "#1452d6" },
    Email: { background: "#0891b2" },
    Text: { background: "#7c3aed" },
    Meeting: { background: "#0d9488" },
    "Renewal review": { background: "#d97706" },
    Other: { background: "#64748b" },
  };
  return map[type] || { background: "#5a5a5a" };
}

// ── Shared small component ────────────────────────────────────────────
function Metric({ label, value, sub, accent }) {
  return (
    <div style={S.metric}>
      <div style={S.metricLabel}>{label}</div>
      <div style={{ ...S.metricValue, color: accent ? "#16a34a" : "#1b1b1b" }}>{value}</div>
      <div style={S.metricSub}>{sub}</div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
// ── ICI brand: royal blue primary, gray/silver accents ──
const SANS = "'Helvetica Neue', -apple-system, 'Segoe UI', Arial, sans-serif";
const INK = "#1a2332";        // near-black blue-gray, primary text
const PAPER = "#eef1f5";      // cool light gray app background
const NAVY = "#1452d6";       // ICI royal blue (primary action / brand)
const NAVY_DK = "#0d3aa8";    // darker blue for borders/hover
const RULE = "#d4dae3";       // cool gray hairline
const MUTE = "#64748b";       // slate gray, secondary text
const FAINT = "#94a3b8";      // lighter slate, tertiary text
const TINT = "#e3ecfd";       // pale blue selection/hover tint
const PANEL = "#ffffff";      // white cards/panels

const S = {
  shell: { fontFamily: SANS, background: PAPER, color: INK, minHeight: "100%", padding: 20, boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 },
  kicker: { fontFamily: SANS, fontSize: 10, letterSpacing: 2, color: NAVY, fontWeight: 700 },
  h1: { fontSize: 32, margin: "4px 0 0", fontWeight: 700, letterSpacing: -0.8 },
  saveTag: { fontFamily: SANS, fontSize: 11, color: MUTE },

  tabs: { display: "flex", gap: 4, borderBottom: `2px solid ${RULE}`, marginBottom: 18 },
  tab: { fontFamily: SANS, fontSize: 14, fontWeight: 600, background: "transparent", border: "none", borderBottom: "3px solid transparent", color: MUTE, padding: "8px 16px", cursor: "pointer", marginBottom: -2 },
  tabActive: { color: NAVY, borderBottom: `3px solid ${NAVY}` },
  tabBadge: { fontFamily: SANS, fontSize: 10, fontWeight: 700, background: "#dc2626", color: "#fff", borderRadius: 9, padding: "1px 6px", marginLeft: 6, verticalAlign: "middle" },

  actionRow: { display: "flex", justifyContent: "flex-end", marginBottom: 14 },
  addBtn: { fontFamily: SANS, fontSize: 13, fontWeight: 600, background: NAVY, color: "#fff", border: "none", borderRadius: 6, padding: "10px 16px", cursor: "pointer" },

  metrics: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 },
  metric: { background: PANEL, border: `1px solid ${RULE}`, borderRadius: 8, padding: "14px 16px" },
  metricLabel: { fontFamily: SANS, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: MUTE },
  metricValue: { fontSize: 26, fontWeight: 700, margin: "2px 0", fontFamily: SANS },
  metricSub: { fontSize: 12, color: MUTE, fontFamily: SANS },

  board: { display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 },
  col: { flex: "0 0 248px", background: "rgba(255,255,255,0.55)", border: `1px solid ${RULE}`, borderRadius: 10, padding: 10, transition: "background .15s, border-color .15s" },
  colOver: { background: TINT, borderColor: NAVY },
  colHead: { borderBottom: `2px solid ${NAVY}`, paddingBottom: 8, marginBottom: 10 },
  colTitleRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  colTitle: { fontSize: 16, fontWeight: 700 },
  colCount: { fontFamily: SANS, fontSize: 11, fontWeight: 700, background: INK, color: "#fff", borderRadius: 10, padding: "1px 8px", minWidth: 16, textAlign: "center" },
  colHint: { fontSize: 11, color: MUTE, fontFamily: SANS, marginTop: 2 },
  colValue: { fontFamily: SANS, fontSize: 12, fontWeight: 600, color: NAVY, marginTop: 4 },
  cards: { display: "flex", flexDirection: "column", gap: 8, minHeight: 60 },
  empty: { fontFamily: SANS, fontSize: 12, color: FAINT, border: `1px dashed ${RULE}`, borderRadius: 6, padding: "16px 8px", textAlign: "center" },
  card: { background: PANEL, border: `1px solid ${RULE}`, borderRadius: 8, padding: 10, cursor: "grab", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  cardDragging: { opacity: 0.4 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 },
  cardClient: { fontSize: 14, fontWeight: 700, lineHeight: 1.2 },
  cardPremium: { fontFamily: SANS, fontSize: 12, fontWeight: 700, color: NAVY, whiteSpace: "nowrap" },
  cardLine: { fontFamily: SANS, fontSize: 11, color: MUTE, marginTop: 3 },
  cardNote: { fontSize: 12, color: MUTE, marginTop: 6, lineHeight: 1.35 },
  outcomeRow: { display: "flex", gap: 6, marginTop: 8 },
  outcomeBtn: { flex: 1, fontFamily: SANS, fontSize: 11, fontWeight: 600, background: "#eef1f5", border: `1px solid ${RULE}`, borderRadius: 5, padding: "4px 0", cursor: "pointer", color: MUTE },
  wonActive: { background: "#16a34a", color: "#fff", borderColor: "#16a34a" },
  lostActive: { background: "#dc2626", color: "#fff", borderColor: "#dc2626" },

  // Contacts
  contactsLayout: { display: "flex", gap: 16, alignItems: "flex-start" },
  listPane: { flex: "0 0 260px" },
  list: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 520, overflowY: "auto" },
  listItem: { display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", background: PANEL, border: `1px solid ${RULE}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer", width: "100%" },
  listItemActive: { borderColor: NAVY, background: TINT },
  listName: { fontSize: 15, fontWeight: 700 },
  listCompany: { fontFamily: SANS, fontSize: 12, color: MUTE, marginTop: 1 },
  listMeta: { fontFamily: SANS, fontSize: 10, color: FAINT, marginTop: 4 },

  detailPane: { flex: 1, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 10, padding: 20, minWidth: 0 },
  detailHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  detailName: { fontSize: 24, margin: 0, fontWeight: 700, letterSpacing: -0.4 },
  detailCompany: { fontFamily: SANS, fontSize: 13, color: NAVY, fontWeight: 600, marginTop: 2 },
  editBtn: { fontFamily: SANS, fontSize: 12, fontWeight: 600, background: "transparent", border: `1px solid ${RULE}`, borderRadius: 6, padding: "6px 14px", cursor: "pointer", color: INK },

  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingBottom: 18, borderBottom: `1px solid ${RULE}`, marginBottom: 18 },
  infoCell: {},
  infoLabel: { fontFamily: SANS, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: MUTE, marginBottom: 3, fontWeight: 600 },
  infoValue: { fontFamily: SANS, fontSize: 14, lineHeight: 1.4 },
  infoLink: { fontFamily: SANS, fontSize: 14, color: NAVY, textDecoration: "none" },

  logBox: { background: PAPER, border: `1px solid ${RULE}`, borderRadius: 8, padding: 14, marginBottom: 18 },
  logTitle: { fontFamily: SANS, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: MUTE, marginBottom: 10 },
  logForm: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  logBtn: { fontFamily: SANS, fontSize: 13, fontWeight: 600, background: NAVY, color: "#fff", border: "none", borderRadius: 6, padding: "9px 18px", cursor: "pointer" },

  timelineTitle: { fontFamily: SANS, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: MUTE, marginBottom: 10 },
  timeline: { display: "flex", flexDirection: "column", gap: 6 },
  activityRow: { display: "flex", alignItems: "center", gap: 10, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 6, padding: "8px 10px" },
  activityType: { fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#fff", background: NAVY, borderRadius: 4, padding: "2px 8px", flex: "0 0 auto" },
  activityDate: { fontFamily: SANS, fontSize: 12, color: MUTE, flex: "0 0 56px" },
  activityNote: { fontFamily: SANS, fontSize: 13, flex: 1, minWidth: 0 },
  activityDel: { background: "transparent", border: "none", color: FAINT, fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px", flex: "0 0 auto" },

  overlay: { position: "fixed", inset: 0, background: "rgba(26,35,50,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 },
  modal: { background: PANEL, border: `1px solid ${RULE}`, borderRadius: 12, padding: 22, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(13,58,168,0.18)" },
  modalHead: { fontSize: 21, fontWeight: 700, marginBottom: 16, letterSpacing: -0.3 },
  field: { display: "block", marginBottom: 12 },
  fieldLabel: { display: "block", fontFamily: SANS, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: MUTE, marginBottom: 4, fontWeight: 600 },
  input: { width: "100%", boxSizing: "border-box", fontFamily: SANS, fontSize: 14, padding: "8px 10px", border: `1px solid ${RULE}`, borderRadius: 6, background: PANEL, color: INK },
  modalActions: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  saveBtn: { fontFamily: SANS, fontSize: 13, fontWeight: 600, background: NAVY, color: "#fff", border: "none", borderRadius: 6, padding: "9px 18px" },
  cancelBtn: { fontFamily: SANS, fontSize: 13, fontWeight: 600, background: "transparent", color: MUTE, border: `1px solid ${RULE}`, borderRadius: 6, padding: "9px 16px", cursor: "pointer" },
  deleteBtn: { fontFamily: SANS, fontSize: 13, fontWeight: 600, background: "transparent", color: "#dc2626", border: "none", cursor: "pointer", padding: "9px 4px" },
  // Tasks & reminders
  reminderWrap: { background: PANEL, border: `1px solid ${RULE}`, borderRadius: 10, padding: 16, marginBottom: 20 },
  reminderHead: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 },
  reminderTitle: { fontSize: 18, fontWeight: 700 },
  reminderSub: { fontFamily: SANS, fontSize: 11, color: MUTE },
  allClear: { fontFamily: SANS, fontSize: 13, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "10px 12px" },
  reminderGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 },
  remCard: { border: "1px solid", borderRadius: 8, padding: "10px 12px", borderLeftWidth: 4 },
  remCardTitle: { fontFamily: SANS, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  remCardBody: { display: "flex", flexDirection: "column", gap: 2 },
  remLine: { textAlign: "left", background: "transparent", border: "none", borderRadius: 4, padding: "4px 6px", cursor: "pointer", fontFamily: SANS, fontSize: 12.5, color: INK, lineHeight: 1.35, display: "flex", flexDirection: "column" },
  reminderWhen: { fontSize: 11, color: MUTE, marginTop: 1 },
  leakHint: { fontFamily: SANS, fontSize: 11, color: MUTE, fontStyle: "italic", marginTop: 6, padding: "0 6px" },

  taskBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 },
  filterRow: { display: "flex", gap: 4, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 8, padding: 3 },
  filterBtn: { fontFamily: SANS, fontSize: 12, fontWeight: 600, background: "transparent", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", color: MUTE },
  filterActive: { background: NAVY, color: "#fff" },
  taskList: { display: "flex", flexDirection: "column", gap: 6 },
  taskRow: { display: "flex", alignItems: "center", gap: 10, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 8, padding: "10px 12px" },
  taskDone: { background: "rgba(255,255,255,0.55)" },
  check: { flex: "0 0 auto", width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${RULE}`, background: PANEL, cursor: "pointer", color: "#fff", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" },
  checkOn: { background: "#16a34a", borderColor: "#16a34a" },
  taskType: { flex: "0 0 auto", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#fff", borderRadius: 4, padding: "2px 8px" },
  taskTitle: { flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 14, lineHeight: 1.3 },
  taskLink: { color: MUTE, fontWeight: 600 },
  taskDue: { flex: "0 0 auto", fontFamily: SANS, fontSize: 12, color: MUTE, minWidth: 56, textAlign: "right" },
  taskEdit: { flex: "0 0 auto", fontFamily: SANS, fontSize: 11, fontWeight: 600, background: "transparent", border: `1px solid ${RULE}`, borderRadius: 5, padding: "5px 10px", cursor: "pointer", color: INK },

  // Accounts
  acctFilterRow: { display: "flex", gap: 3, flexWrap: "wrap" },
  acctFilterBtn: { fontFamily: SANS, fontSize: 11, fontWeight: 600, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: MUTE },
  acctFilterActive: { background: NAVY, color: "#fff", borderColor: NAVY },
  acctRowMeta: { display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
  statusPill: { fontFamily: SANS, fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 7px", textTransform: "uppercase", letterSpacing: 0.4 },
  acctSubRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 6 },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${RULE}` },
  sectionTitle: { fontFamily: SANS, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: INK },
  linkBtn: { fontFamily: SANS, fontSize: 12, fontWeight: 600, background: "transparent", border: "none", color: NAVY, cursor: "pointer" },
  smallAddBtn: { fontFamily: SANS, fontSize: 12, fontWeight: 600, background: TINT, color: NAVY, border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" },
  acctContacts: { display: "flex", flexDirection: "column", gap: 6 },
  acctContactRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: PAPER, borderRadius: 6, padding: "8px 12px" },
  acctContactName: { fontFamily: SANS, fontSize: 14, fontWeight: 700 },
  acctContactMeta: { fontFamily: SANS, fontSize: 13, color: MUTE, textDecoration: "none" },
  claimsNote: { fontFamily: SANS, fontSize: 13, color: MUTE, fontStyle: "italic", background: PAPER, borderRadius: 8, padding: "16px", marginTop: 20, textAlign: "center" },
  claimTotal: { color: MUTE, fontWeight: 600 },
  claimForm: { background: PAPER, border: `1px solid ${RULE}`, borderRadius: 8, padding: 14, marginBottom: 12 },
  claimFormGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 },
  claimList: { display: "flex", flexDirection: "column", gap: 8 },
  claimRow: { display: "flex", alignItems: "flex-start", gap: 12, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 8, padding: "10px 12px" },
  claimStatus: { flex: "0 0 auto", fontFamily: SANS, fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },
  claimMain: { flex: 1, minWidth: 0 },
  claimTopLine: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  claimType: { fontFamily: SANS, fontSize: 14, fontWeight: 700 },
  claimDate: { fontFamily: SANS, fontSize: 12, color: MUTE },
  claimAmount: { fontFamily: SANS, fontSize: 13, fontWeight: 700, color: NAVY },
  claimDesc: { fontFamily: SANS, fontSize: 13, color: MUTE, marginTop: 4, lineHeight: 1.4 },
  claimActions: { flex: "0 0 auto", display: "flex", alignItems: "center", gap: 4 },
  claimEditBtn: { fontFamily: SANS, fontSize: 11, fontWeight: 600, background: "transparent", border: `1px solid ${RULE}`, borderRadius: 5, padding: "4px 9px", cursor: "pointer", color: INK },
  lineChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  lineChip: { fontFamily: SANS, fontSize: 12, fontWeight: 600, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 16, padding: "5px 12px", cursor: "pointer", color: MUTE },
  lineChipOn: { background: NAVY, color: "#fff", borderColor: NAVY },

  // New Business
  nbDropdown: { position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(13,58,168,0.15)", zIndex: 30, overflow: "hidden", maxHeight: 280, overflowY: "auto" },
  nbDropHead: { fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: MUTE, padding: "8px 12px 4px" },
  nbDropItem: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "8px 12px", fontFamily: SANS, fontSize: 13, color: INK, cursor: "pointer" },
  nbToolbar: { display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  nbProgressTrack: { height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" },
  nbProgressFill: { height: "100%", background: NAVY, borderRadius: 4, transition: "width .25s" },
  nbProgressLabel: { fontFamily: SANS, fontSize: 11, color: MUTE, marginTop: 4 },
  nbRawBox: { background: PAPER, border: `1px solid ${RULE}`, borderRadius: 8, padding: 14, marginBottom: 4 },
  nbRawHead: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 },
  nbRawHint: { fontFamily: SANS, fontSize: 11, color: MUTE },
  nbSection: { border: `1px solid ${RULE}`, borderRadius: 8, marginBottom: 8, overflow: "hidden", background: PANEL },
  nbSectionHead: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: PAPER, border: "none", padding: "12px 14px", cursor: "pointer" },
  nbSectionTitle: { fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK },
  nbSectionMeta: { display: "flex", alignItems: "center", gap: 10 },
  nbSectionCount: { fontFamily: SANS, fontSize: 11, fontWeight: 600, color: MUTE, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 10, padding: "1px 8px" },
  nbChevron: { fontFamily: SANS, fontSize: 12, color: MUTE },
  nbSectionBody: { padding: 16, borderTop: `1px solid ${RULE}` },
  nbSectionNote: { fontFamily: SANS, fontSize: 12, color: MUTE, fontStyle: "italic", background: TINT, borderRadius: 6, padding: "8px 10px", marginBottom: 14 },
  nbFieldGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 },
  nbCheckRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  nbCheckBtn: { fontFamily: SANS, fontSize: 13, fontWeight: 600, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 6, padding: "7px 18px", cursor: "pointer", color: MUTE },
  nbChoiceBtn: { fontFamily: SANS, fontSize: 12, fontWeight: 600, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 6, padding: "7px 12px", cursor: "pointer", color: MUTE },
  nbCheckOn: { background: NAVY, color: "#fff", borderColor: NAVY },
  repeatHeadRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  repeatRow: { display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", background: PAPER, borderRadius: 6, padding: "8px 10px", marginBottom: 6 },
  repeatColLabel: { display: "block", fontFamily: SANS, fontSize: 10, fontWeight: 600, color: MUTE, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },

  // Calendar
  calToolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 },
  calNav: { display: "flex", alignItems: "center", gap: 8 },
  calNavBtn: { fontFamily: SANS, fontSize: 18, fontWeight: 700, lineHeight: 1, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 6, width: 32, height: 32, cursor: "pointer", color: INK },
  calMonthLabel: { fontFamily: SANS, fontSize: 18, fontWeight: 700, minWidth: 160, textAlign: "center" },
  calTodayBtn: { fontFamily: SANS, fontSize: 12, fontWeight: 600, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", color: INK },
  calLegend: { display: "flex", alignItems: "center", gap: 14 },
  legendItem: { display: "flex", alignItems: "center", gap: 5, fontFamily: SANS, fontSize: 12, color: MUTE },
  legendDot: { width: 10, height: 10, borderRadius: 3, display: "inline-block" },
  calLayout: { display: "flex", gap: 16, alignItems: "flex-start" },
  calGridWrap: { flex: 1, minWidth: 0, background: PANEL, border: `1px solid ${RULE}`, borderRadius: 10, overflow: "hidden" },
  calWeekHead: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: PAPER, borderBottom: `1px solid ${RULE}` },
  calWeekCell: { fontFamily: SANS, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTE, textAlign: "center", padding: "8px 0" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "minmax(92px, 1fr)" },
  calCell: { borderRight: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, padding: 4, cursor: "pointer", minHeight: 92, display: "flex", flexDirection: "column", overflow: "hidden" },
  calCellOut: { background: "#f8fafc" },
  calCellSel: { background: TINT, boxShadow: `inset 0 0 0 2px ${NAVY}` },
  calCellHead: { display: "flex", justifyContent: "flex-end" },
  calDayNum: { fontFamily: SANS, fontSize: 12, fontWeight: 600, color: INK, padding: "1px 5px", borderRadius: 10 },
  calToday: { background: NAVY, color: "#fff" },
  calChips: { display: "flex", flexDirection: "column", gap: 2, marginTop: 2, overflow: "hidden" },
  calChip: { fontFamily: SANS, fontSize: 10.5, color: "#fff", borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" },
  calMore: { fontFamily: SANS, fontSize: 10, color: MUTE, paddingLeft: 4 },
  calDayPanel: { flex: "0 0 300px", background: PANEL, border: `1px solid ${RULE}`, borderRadius: 10, padding: 14, alignSelf: "stretch" },
  calDayPanelHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${RULE}` },
  calDayPanelDate: { fontFamily: SANS, fontSize: 16, fontWeight: 700 },
  calDayPanelSub: { fontFamily: SANS, fontSize: 12, color: MUTE, marginTop: 1 },
  calDayList: { display: "flex", flexDirection: "column", gap: 8 },
  calDayItem: { display: "flex", alignItems: "flex-start", gap: 8, background: PAPER, borderRadius: 8, padding: "8px 10px" },
  calItemBar: { flex: "0 0 auto", width: 4, alignSelf: "stretch", borderRadius: 2, minHeight: 28 },
  calItemTitle: { fontFamily: SANS, fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 },
  calItemMeta: { fontFamily: SANS, fontSize: 11.5, color: MUTE, marginTop: 2 },
  calItemNotes: { fontFamily: SANS, fontSize: 12, color: MUTE, marginTop: 4, lineHeight: 1.35 },
  calTaskBanner: { fontFamily: SANS, fontSize: 12, color: "#15803d", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 10px", marginBottom: 14 },
  calDoneRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  calDoneLabel: { fontFamily: SANS, fontSize: 13, color: INK },

  muted: { color: MUTE, fontFamily: SANS },
};

const REM_TONE = {
  overdue: { borderColor: "#dc2626", background: "#fef2f2" },
  today: { borderColor: "#d97706", background: "#fffbeb" },
  soon: { borderColor: NAVY, background: TINT },
  leak: { borderColor: "#7c3aed", background: "#f5f3ff" },
};

const CSS = `
  .ici-board::-webkit-scrollbar, .ici-list::-webkit-scrollbar { height: 10px; width: 10px; }
  .ici-board::-webkit-scrollbar-thumb { background: ${RULE}; border-radius: 5px; }
  .ici-card:active { cursor: grabbing; }
  .ici-card:hover { box-shadow: 0 4px 14px rgba(20,82,214,0.12); border-color: ${NAVY}; }
  .ici-list-pane button:hover { border-color: ${NAVY}; }
  .ici-activity-row:hover { border-color: ${NAVY}; }
  .ici-rem-line:hover { background: rgba(20,82,214,0.06); }
  .ici-task-row:hover { border-color: ${NAVY}; }
  .ici-claim-row:hover { border-color: ${NAVY}; }
  .ici-nb-sec:hover { background: ${TINT}; }
  .ici-cal-cell:hover { background: ${TINT}; }
  .ici-cal-item:hover { background: ${TINT}; }
  .ici-pri-btn { transition: background .15s; }
  .ici-pri-btn:hover { background: ${NAVY_DK} !important; }
  .ici-pri-btn:disabled { opacity: 0.6; cursor: default; }
  @media (max-width: 720px) {
    .ici-col { flex: 0 0 210px !important; }
    .ici-contacts-layout { flex-direction: column !important; }
    .ici-list-pane { flex: 1 1 auto !important; width: 100%; }
    .ici-log-form { flex-direction: column !important; align-items: stretch !important; }
    .ici-log-form > * { flex: 1 1 auto !important; }
    .ici-cal-layout { flex-direction: column !important; }
    .ici-cal-layout > * { width: 100%; }
  }
`;
