"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { adminWrite } from "@/lib/admin/catalog-write";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Upload, Download, Search } from "lucide-react";
import { AdminBackBar } from "@/components/admin/AdminBackBar";

type WhatsappContact = {
  id: string;
  full_name: string | null;
  phone_e164: string;
  country_code: string | null;
  tags: string[] | null;
  created_at: string;
};

type CountryOption = {
  iso: string;
  name: string;
  dial: string; // with +
};

// adjust this list however you like
const COUNTRIES: CountryOption[] = [
  { iso: "AF", name: "Afghanistan", dial: "+93" },
  { iso: "AL", name: "Albania", dial: "+355" },
  { iso: "DZ", name: "Algeria", dial: "+213" },
  { iso: "AS", name: "American Samoa", dial: "+1-684" },
  { iso: "AD", name: "Andorra", dial: "+376" },
  { iso: "AO", name: "Angola", dial: "+244" },
  { iso: "AI", name: "Anguilla", dial: "+1-264" },
  { iso: "AG", name: "Antigua and Barbuda", dial: "+1-268" },
  { iso: "AR", name: "Argentina", dial: "+54" },
  { iso: "AM", name: "Armenia", dial: "+374" },
  { iso: "AW", name: "Aruba", dial: "+297" },
  { iso: "AU", name: "Australia", dial: "+61" },
  { iso: "AT", name: "Austria", dial: "+43" },
  { iso: "AZ", name: "Azerbaijan", dial: "+994" },

  { iso: "BS", name: "Bahamas", dial: "+1-242" },
  { iso: "BH", name: "Bahrain", dial: "+973" },
  { iso: "BD", name: "Bangladesh", dial: "+880" },
  { iso: "BB", name: "Barbados", dial: "+1-246" },
  { iso: "BY", name: "Belarus", dial: "+375" },
  { iso: "BE", name: "Belgium", dial: "+32" },
  { iso: "BZ", name: "Belize", dial: "+501" },
  { iso: "BJ", name: "Benin", dial: "+229" },
  { iso: "BM", name: "Bermuda", dial: "+1-441" },
  { iso: "BT", name: "Bhutan", dial: "+975" },
  { iso: "BO", name: "Bolivia", dial: "+591" },
  { iso: "BA", name: "Bosnia and Herzegovina", dial: "+387" },
  { iso: "BW", name: "Botswana", dial: "+267" },
  { iso: "BR", name: "Brazil", dial: "+55" },
  { iso: "IO", name: "British Indian Ocean Territory", dial: "+246" },
  { iso: "VG", name: "British Virgin Islands", dial: "+1-284" },
  { iso: "BN", name: "Brunei", dial: "+673" },
  { iso: "BG", name: "Bulgaria", dial: "+359" },
  { iso: "BF", name: "Burkina Faso", dial: "+226" },
  { iso: "BI", name: "Burundi", dial: "+257" },

  { iso: "KH", name: "Cambodia", dial: "+855" },
  { iso: "CM", name: "Cameroon", dial: "+237" },
  { iso: "CA", name: "Canada", dial: "+1" },
  { iso: "CV", name: "Cape Verde", dial: "+238" },
  { iso: "KY", name: "Cayman Islands", dial: "+1-345" },
  { iso: "CF", name: "Central African Republic", dial: "+236" },
  { iso: "TD", name: "Chad", dial: "+235" },
  { iso: "CL", name: "Chile", dial: "+56" },
  { iso: "CN", name: "China", dial: "+86" },
  { iso: "CO", name: "Colombia", dial: "+57" },
  { iso: "KM", name: "Comoros", dial: "+269" },
  { iso: "CD", name: "Congo (DRC)", dial: "+243" },
  { iso: "CG", name: "Congo (Republic)", dial: "+242" },
  { iso: "CR", name: "Costa Rica", dial: "+506" },
  { iso: "HR", name: "Croatia", dial: "+385" },
  { iso: "CU", name: "Cuba", dial: "+53" },
  { iso: "CW", name: "Curaçao", dial: "+599" },
  { iso: "CY", name: "Cyprus", dial: "+357" },
  { iso: "CZ", name: "Czech Republic", dial: "+420" },

  { iso: "DK", name: "Denmark", dial: "+45" },
  { iso: "DJ", name: "Djibouti", dial: "+253" },
  { iso: "DM", name: "Dominica", dial: "+1-767" },
  { iso: "DO", name: "Dominican Republic", dial: "+1-809" },

  { iso: "EC", name: "Ecuador", dial: "+593" },
  { iso: "EG", name: "Egypt", dial: "+20" },
  { iso: "SV", name: "El Salvador", dial: "+503" },
  { iso: "GQ", name: "Equatorial Guinea", dial: "+240" },
  { iso: "ER", name: "Eritrea", dial: "+291" },
  { iso: "EE", name: "Estonia", dial: "+372" },
  { iso: "SZ", name: "Eswatini", dial: "+268" },
  { iso: "ET", name: "Ethiopia", dial: "+251" },

  { iso: "FJ", name: "Fiji", dial: "+679" },
  { iso: "FI", name: "Finland", dial: "+358" },
  { iso: "FR", name: "France", dial: "+33" },

  { iso: "GA", name: "Gabon", dial: "+241" },
  { iso: "GM", name: "Gambia", dial: "+220" },
  { iso: "GE", name: "Georgia", dial: "+995" },
  { iso: "DE", name: "Germany", dial: "+49" },
  { iso: "GH", name: "Ghana", dial: "+233" },
  { iso: "GR", name: "Greece", dial: "+30" },
  { iso: "GD", name: "Grenada", dial: "+1-473" },
  { iso: "GU", name: "Guam", dial: "+1-671" },
  { iso: "GT", name: "Guatemala", dial: "+502" },
  { iso: "GN", name: "Guinea", dial: "+224" },
  { iso: "GW", name: "Guinea-Bissau", dial: "+245" },
  { iso: "GY", name: "Guyana", dial: "+592" },

  { iso: "HT", name: "Haiti", dial: "+509" },
  { iso: "HN", name: "Honduras", dial: "+504" },
  { iso: "HK", name: "Hong Kong", dial: "+852" },
  { iso: "HU", name: "Hungary", dial: "+36" },

  { iso: "IS", name: "Iceland", dial: "+354" },
  { iso: "IN", name: "India", dial: "+91" },
  { iso: "ID", name: "Indonesia", dial: "+62" },
  { iso: "IR", name: "Iran", dial: "+98" },
  { iso: "IQ", name: "Iraq", dial: "+964" },
  { iso: "IE", name: "Ireland", dial: "+353" },
  { iso: "IL", name: "Israel", dial: "+972" },
  { iso: "IT", name: "Italy", dial: "+39" },

  { iso: "JM", name: "Jamaica", dial: "+1-876" },
  { iso: "JP", name: "Japan", dial: "+81" },
  { iso: "JO", name: "Jordan", dial: "+962" },

  { iso: "KZ", name: "Kazakhstan", dial: "+7" },
  { iso: "KE", name: "Kenya", dial: "+254" },
  { iso: "KI", name: "Kiribati", dial: "+686" },
  { iso: "KP", name: "North Korea", dial: "+850" },
  { iso: "KR", name: "South Korea", dial: "+82" },
  { iso: "KW", name: "Kuwait", dial: "+965" },
  { iso: "KG", name: "Kyrgyzstan", dial: "+996" },

  { iso: "LA", name: "Laos", dial: "+856" },
  { iso: "LV", name: "Latvia", dial: "+371" },
  { iso: "LB", name: "Lebanon", dial: "+961" },
  { iso: "LS", name: "Lesotho", dial: "+266" },
  { iso: "LR", name: "Liberia", dial: "+231" },
  { iso: "LY", name: "Libya", dial: "+218" },
  { iso: "LI", name: "Liechtenstein", dial: "+423" },
  { iso: "LT", name: "Lithuania", dial: "+370" },
  { iso: "LU", name: "Luxembourg", dial: "+352" },

  { iso: "MO", name: "Macau", dial: "+853" },
  { iso: "MG", name: "Madagascar", dial: "+261" },
  { iso: "MW", name: "Malawi", dial: "+265" },
  { iso: "MY", name: "Malaysia", dial: "+60" },
  { iso: "MV", name: "Maldives", dial: "+960" },
  { iso: "ML", name: "Mali", dial: "+223" },
  { iso: "MT", name: "Malta", dial: "+356" },
  { iso: "MH", name: "Marshall Islands", dial: "+692" },
  { iso: "MR", name: "Mauritania", dial: "+222" },
  { iso: "MU", name: "Mauritius", dial: "+230" },
  { iso: "MX", name: "Mexico", dial: "+52" },
  { iso: "FM", name: "Micronesia", dial: "+691" },
  { iso: "MD", name: "Moldova", dial: "+373" },
  { iso: "MC", name: "Monaco", dial: "+377" },
  { iso: "MN", name: "Mongolia", dial: "+976" },
  { iso: "ME", name: "Montenegro", dial: "+382" },
  { iso: "MS", name: "Montserrat", dial: "+1-664" },
  { iso: "MA", name: "Morocco", dial: "+212" },
  { iso: "MZ", name: "Mozambique", dial: "+258" },
  { iso: "MM", name: "Myanmar", dial: "+95" },

  { iso: "NA", name: "Namibia", dial: "+264" },
  { iso: "NR", name: "Nauru", dial: "+674" },
  { iso: "NP", name: "Nepal", dial: "+977" },
  { iso: "NL", name: "Netherlands", dial: "+31" },
  { iso: "NC", name: "New Caledonia", dial: "+687" },
  { iso: "NZ", name: "New Zealand", dial: "+64" },
  { iso: "NI", name: "Nicaragua", dial: "+505" },
  { iso: "NE", name: "Niger", dial: "+227" },
  { iso: "NG", name: "Nigeria", dial: "+234" },
  { iso: "NO", name: "Norway", dial: "+47" },

  { iso: "OM", name: "Oman", dial: "+968" },

  { iso: "PK", name: "Pakistan", dial: "+92" },
  { iso: "PW", name: "Palau", dial: "+680" },
  { iso: "PA", name: "Panama", dial: "+507" },
  { iso: "PG", name: "Papua New Guinea", dial: "+675" },
  { iso: "PY", name: "Paraguay", dial: "+595" },
  { iso: "PE", name: "Peru", dial: "+51" },
  { iso: "PH", name: "Philippines", dial: "+63" },
  { iso: "PL", name: "Poland", dial: "+48" },
  { iso: "PT", name: "Portugal", dial: "+351" },
  { iso: "PR", name: "Puerto Rico", dial: "+1-787" },

  { iso: "QA", name: "Qatar", dial: "+974" },

  { iso: "RO", name: "Romania", dial: "+40" },
  { iso: "RU", name: "Russia", dial: "+7" },
  { iso: "RW", name: "Rwanda", dial: "+250" },

  { iso: "BL", name: "Saint Barthélemy", dial: "+590" },
  { iso: "KN", name: "Saint Kitts and Nevis", dial: "+1-869" },
  { iso: "LC", name: "Saint Lucia", dial: "+1-758" },
  { iso: "MF", name: "Saint Martin", dial: "+590" },
  { iso: "VC", name: "Saint Vincent and the Grenadines", dial: "+1-784" },
  { iso: "WS", name: "Samoa", dial: "+685" },
  { iso: "SM", name: "San Marino", dial: "+378" },
  { iso: "ST", name: "São Tomé and Príncipe", dial: "+239" },
  { iso: "SA", name: "Saudi Arabia", dial: "+966" },
  { iso: "SN", name: "Senegal", dial: "+221" },
  { iso: "RS", name: "Serbia", dial: "+381" },
  { iso: "SC", name: "Seychelles", dial: "+248" },
  { iso: "SL", name: "Sierra Leone", dial: "+232" },
  { iso: "SG", name: "Singapore", dial: "+65" },
  { iso: "SX", name: "Sint Maarten", dial: "+1-721" },
  { iso: "SK", name: "Slovakia", dial: "+421" },
  { iso: "SI", name: "Slovenia", dial: "+386" },
  { iso: "SB", name: "Solomon Islands", dial: "+677" },
  { iso: "SO", name: "Somalia", dial: "+252" },
  { iso: "ZA", name: "South Africa", dial: "+27" },
  { iso: "SS", name: "South Sudan", dial: "+211" },
  { iso: "ES", name: "Spain", dial: "+34" },
  { iso: "LK", name: "Sri Lanka", dial: "+94" },
  { iso: "SD", name: "Sudan", dial: "+249" },
  { iso: "SR", name: "Suriname", dial: "+597" },
  { iso: "SE", name: "Sweden", dial: "+46" },
  { iso: "CH", name: "Switzerland", dial: "+41" },
  { iso: "SY", name: "Syria", dial: "+963" },

  { iso: "TW", name: "Taiwan", dial: "+886" },
  { iso: "TJ", name: "Tajikistan", dial: "+992" },
  { iso: "TZ", name: "Tanzania", dial: "+255" },
  { iso: "TH", name: "Thailand", dial: "+66" },
  { iso: "TL", name: "Timor-Leste", dial: "+670" },
  { iso: "TG", name: "Togo", dial: "+228" },
  { iso: "TO", name: "Tonga", dial: "+676" },
  { iso: "TT", name: "Trinidad and Tobago", dial: "+1-868" },
  { iso: "TN", name: "Tunisia", dial: "+216" },
  { iso: "TR", name: "Turkey", dial: "+90" },
  { iso: "TM", name: "Turkmenistan", dial: "+993" },
  { iso: "TC", name: "Turks and Caicos Islands", dial: "+1-649" },
  { iso: "TV", name: "Tuvalu", dial: "+688" },

  { iso: "UG", name: "Uganda", dial: "+256" },
  { iso: "UA", name: "Ukraine", dial: "+380" },
  { iso: "AE", name: "United Arab Emirates", dial: "+971" },
  { iso: "GB", name: "United Kingdom", dial: "+44" },
  { iso: "US", name: "United States", dial: "+1" },
  { iso: "UY", name: "Uruguay", dial: "+598" },
  { iso: "UZ", name: "Uzbekistan", dial: "+998" },

  { iso: "VU", name: "Vanuatu", dial: "+678" },
  { iso: "VA", name: "Vatican City", dial: "+379" },
  { iso: "VE", name: "Venezuela", dial: "+58" },
  { iso: "VN", name: "Vietnam", dial: "+84" },
  { iso: "VI", name: "U.S. Virgin Islands", dial: "+1-340" },

  { iso: "YE", name: "Yemen", dial: "+967" },

  { iso: "ZM", name: "Zambia", dial: "+260" },
  { iso: "ZW", name: "Zimbabwe", dial: "+263" },
];

export default function WhatsappContactsPage() {
  const [contacts, setContacts] = useState<WhatsappContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // add form
  const [newName, setNewName] = useState("");
  const [selectedCountryIso, setSelectedCountryIso] = useState<string>("IN");
  const [localNumber, setLocalNumber] = useState("");
  const [newTags, setNewTags] = useState("");

  // import
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    async function loadContacts() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/whatsapp?resource=contacts", {
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok && j?.ok) {
          setContacts((j.contacts || []) as WhatsappContact[]);
        } else {
          console.error("Error loading whatsapp_contacts", j?.error);
        }
      } catch (err) {
        console.error("Error loading whatsapp_contacts", err);
      }
      setLoading(false);
    }

    loadContacts();
  }, []);

  const filteredContacts = contacts.filter((c) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (c.full_name || "").toLowerCase().includes(term) ||
      (c.phone_e164 || "").toLowerCase().includes(term)
    );
  });

  /* ---------------- Add single contact ---------------- */

  async function handleAddContact() {
    const numberRaw = localNumber.replace(/\D/g, ""); // digits only
    if (!numberRaw) return;

    const country =
      COUNTRIES.find((c) => c.iso === selectedCountryIso) || COUNTRIES[0];

    const phone_e164 = `${country.dial}${numberRaw}`;

    const tagsArray =
      newTags
        .split(/[;,]/)
        .map((t) => t.trim())
        .filter(Boolean) || [];

    let data: WhatsappContact;
    try {
      data = (await adminWrite({
        table: "whatsapp_contacts",
        op: "insert",
        data: {
          full_name: newName || null,
          phone_e164,
          country_code: country.iso,
          tags: tagsArray.length ? tagsArray : null,
        },
      })) as WhatsappContact;
    } catch (err) {
      console.error("Error adding contact", err);
      return;
    }

    setContacts((prev) => [data as WhatsappContact, ...prev]);
    setAddOpen(false);
    setNewName("");
    setLocalNumber("");
    setSelectedCountryIso("IN");
    setNewTags("");
  }

  /* ---------------- Import CSV ---------------- */

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setCsvFile(file || null);
    setImportError(null);
  }

  async function handleImportCsv() {
    if (!csvFile) {
      setImportError("Please select a CSV file to import.");
      return;
    }

    setImporting(true);
    setImportError(null);

    try {
      const text = await csvFile.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        setImportError("CSV seems empty. At least one data row is required.");
        setImporting(false);
        return;
      }

      const header = lines[0].split(",").map((h) => h.trim());
      const required = ["full_name", "phone_e164", "country_code", "tags"];

      const missing = required.filter((col) => !header.includes(col));
      if (missing.length > 0) {
        setImportError(
          `Missing columns: ${missing.join(
            ", "
          )}. Please download the sample CSV template.`
        );
        setImporting(false);
        return;
      }

      const rowsToInsert: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(",");
        const row: Record<string, string> = {};

        header.forEach((col, idx) => {
          row[col] = (values[idx] || "").trim();
        });

        if (!row["phone_e164"]) continue;

        const phoneRaw = row["phone_e164"];
        const phone_e164 = phoneRaw.startsWith("+") ? phoneRaw : `+${phoneRaw}`;

        const tagsRaw = row["tags"] || "";
        const tagsArray =
          tagsRaw
            .split(/[;,]/)
            .map((t) => t.trim())
            .filter(Boolean) || [];

        rowsToInsert.push({
          full_name: row["full_name"] || null,
          phone_e164,
          country_code: row["country_code"] || null,
          tags: tagsArray.length ? tagsArray : null,
        });
      }

      if (rowsToInsert.length === 0) {
        setImportError(
          "No valid rows found in CSV. Check phone numbers are filled."
        );
        setImporting(false);
        return;
      }

      const insertedRows: WhatsappContact[] = [];
      try {
        for (const r of rowsToInsert) {
          const inserted = (await adminWrite({
            table: "whatsapp_contacts",
            op: "insert",
            data: r,
          })) as WhatsappContact;
          if (inserted) insertedRows.push(inserted);
        }
      } catch (err) {
        console.error("Import error", err);
        setImportError("Failed to import contacts. Check console for details.");
        setImporting(false);
        return;
      }

      setContacts((prev) => [...insertedRows, ...prev]);
      setImportOpen(false);
      setCsvFile(null);
    } catch (err) {
      console.error(err);
      setImportError("Unexpected error parsing CSV.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
    <AdminBackBar title="Contacts" to="/admin/whatsapp" />
    <div className="container mx-auto py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">WhatsApp Contacts</h2>
          <p className="text-xs text-muted-foreground">
            These numbers will be used as audience for WhatsApp campaigns.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="mr-1 h-4 w-4" />
            Import CSV
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href="/whatsapp_contacts_sample.csv" download>
              <Download className="mr-1 h-4 w-4" />
              Download CSV template
            </a>
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add contact
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 max-w-xs">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          className="h-8 text-xs"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading contacts…</p>
      ) : filteredContacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No WhatsApp contacts yet. You can add them manually or via CSV import.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-left">Country</th>
                <th className="px-3 py-2 text-left">Tags</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{c.full_name || "-"}</td>
                  <td className="px-3 py-2 font-mono">{c.phone_e164}</td>
                  <td className="px-3 py-2">{c.country_code || "-"}</td>
                  <td className="px-3 py-2">
                    {c.tags && c.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add contact dialog (single contact, with country dropdown) */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add WhatsApp contact</DialogTitle>
            <DialogDescription className="text-xs">
              Add a single WhatsApp contact. Choose country and enter the local
              mobile number; we’ll build the full international format.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Contact Name"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 space-y-1">
                <Label htmlFor="country-select">Country</Label>
                <select
                  id="country-select"
                  className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
                  value={selectedCountryIso}
                  onChange={(e) => setSelectedCountryIso(e.target.value)}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.iso} value={c.iso}>
                      {c.name} ({c.dial})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-[1.2] space-y-1">
                <Label htmlFor="local-number">Mobile number</Label>
                <div className="flex items-center gap-2">
                  <div className="rounded-md border bg-muted px-2 py-2 text-xs">
                    {
                      (
                        COUNTRIES.find((c) => c.iso === selectedCountryIso) ||
                        COUNTRIES[0]
                      ).dial
                    }
                  </div>
                  <Input
                    id="local-number"
                    value={localNumber}
                    onChange={(e) => setLocalNumber(e.target.value)}
                    placeholder="9876543210"
                    className="flex-1"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Enter the number without country code. Only digits are needed.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="tags">Tags (optional)</Label>
              <Input
                id="tags"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="customer;sunblock_buyer"
              />
              <p className="text-[11px] text-muted-foreground">
                Use commas or semicolons to separate multiple tags.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddContact}>Save contact</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV dialog (unchanged logic) */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import WhatsApp contacts (CSV)</DialogTitle>
            <DialogDescription className="text-xs space-y-1">
              <p>
                Upload a CSV file with the columns:{" "}
                <code>full_name, phone_e164, country_code, tags</code>.
              </p>
              <p>
                Need a starting point?{" "}
                <a
                  href="/whatsapp_contacts_sample.csv"
                  download
                  className="underline"
                >
                  Download the sample CSV template
                </a>
                .
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="csv-file">CSV file</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
              />
            </div>
            {importError && (
              <p className="text-xs text-red-600">{importError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportCsv} disabled={importing}>
              {importing ? "Importing…" : "Import contacts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
