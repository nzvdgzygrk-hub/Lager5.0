let db;
let editId = null;
let currentPhotos = [];

const g = id => document.getElementById(id);

const request = indexedDB.open("lager5", 1);

request.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("artikel")) {
        db.createObjectStore("artikel", { keyPath: "id", autoIncrement: true });
    }
};

request.onsuccess = e => {
    db = e.target.result;
    ladeAnteil();
    render();
};

request.onerror = e => {
    alert("Datenbank konnte nicht geöffnet werden.");
    console.error(e);
};

function toggleForm() {
    g("form").classList.toggle("hidden");
}

function toNumber(value) {
    return Number(String(value || "0").replace(",", ".")) || 0;
}

function formatEuro(value) {
    const n = toNumber(value);
    return Number.isInteger(n) ? n + " €" : n.toFixed(2).replace(".", ",") + " €";
}

function berechneAusgleich(umsatz, eingenommen) {
    const diff = toNumber(eingenommen) - toNumber(umsatz) / 2;
    if (Math.abs(diff) < 0.01) return "⚖️ Ausgeglichen";
    return diff > 0
        ? "➡️ Du gibst Partner: " + formatEuro(diff)
        : "⬅️ Partner gibt dir: " + formatEuro(Math.abs(diff));
}

function ladeAnteil() {
    const wert = localStorage.getItem("meinAnteil") || "0";
    if (g("meinAnteil")) g("meinAnteil").value = wert === "0" ? "" : wert;
    if (g("meinAnteilAnzeige")) g("meinAnteilAnzeige").textContent = formatEuro(wert);
}

function speichereAnteil() {
    const feld = g("meinAnteil");
    const wert = feld && feld.value ? feld.value.replace(",", ".") : "0";
    localStorage.setItem("meinAnteil", wert);
    ladeAnteil();
    render();
}

function getGespeicherterAnteil() {
    return localStorage.getItem("meinAnteil") || "0";
}

function resizeImage(file, maxWidth = 600, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round(height * maxWidth / width);
                    width = maxWidth;
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                resolve({ name: file.name, data: canvas.toDataURL("image/jpeg", quality) });
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

if (g("photos")) {
    g("photos").addEventListener("change", async e => {
        currentPhotos = [];
        g("preview").innerHTML = "";
        for (const file of [...e.target.files]) {
            const photo = await resizeImage(file);
            currentPhotos.push(photo);
            const img = document.createElement("img");
            img.src = photo.data;
            g("preview").appendChild(img);
        }
    });
}

function getAllArtikel() {
    return new Promise(resolve => {
        const req = db.transaction("artikel", "readonly").objectStore("artikel").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });
}

function saveItem() {
    const artikel = {
        title: g("title").value.trim(),
        location: g("location").value.trim(),
        price: Number(g("price").value) || 0,
        favorite: g("favorite").checked,
        note: g("note").value.trim(),
        status: "Verfügbar",
        photos: currentPhotos
    };

    const tx = db.transaction("artikel", "readwrite");
    const store = tx.objectStore("artikel");

    if (editId !== null) {
        artikel.id = editId;
        store.put(artikel);
        editId = null;
    } else {
        store.add(artikel);
    }

    tx.oncomplete = () => {
        clearForm();
        render();
    };
    tx.onerror = () => alert("Speichern fehlgeschlagen. Speicher eventuell voll.");
}

function clearForm() {
    g("title").value = "";
    g("location").value = "";
    g("price").value = "";
    g("favorite").checked = false;
    g("note").value = "";
    g("photos").value = "";
    currentPhotos = [];
    g("preview").innerHTML = "";
    g("form").classList.add("hidden");
}

function soldItem(id) {
    const tx = db.transaction("artikel", "readwrite");
    const store = tx.objectStore("artikel");
    const req = store.get(id);
    req.onsuccess = () => {
        const artikel = req.result;
        if (!artikel) return;
        artikel.status = "Verkauft";
        artikel.photos = [];
        store.put(artikel);
    };
    tx.oncomplete = render;
}

function delItem(id) {
    if (!confirm("Löschen?")) return;
    const tx = db.transaction("artikel", "readwrite");
    tx.objectStore("artikel").delete(id);
    tx.oncomplete = render;
}

function editItem(id) {
    const req = db.transaction("artikel", "readonly").objectStore("artikel").get(id);
    req.onsuccess = () => {
        const x = req.result;
        if (!x) return;
        g("title").value = x.title || "";
        g("location").value = x.location || "";
        g("price").value = x.price || "";
        g("favorite").checked = !!x.favorite;
        g("note").value = x.note || "";
        currentPhotos = x.photos || [];
        g("preview").innerHTML = "";
        currentPhotos.forEach(p => {
            const img = document.createElement("img");
            img.src = p.data;
            g("preview").appendChild(img);
        });
        editId = id;
        g("form").classList.remove("hidden");
    };
}

async function exportJson() {
    const daten = await getAllArtikel();
    const backup = {
        version: 2,
        eingenommen: getGespeicherterAnteil(),
        artikel: daten
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lager5-backup.json";
    a.click();
}

if (g("importFile")) {
    g("importFile").addEventListener("change", e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const backup = JSON.parse(reader.result);
                const daten = Array.isArray(backup) ? backup : (backup.artikel || backup.daten || []);
                if (!Array.isArray(daten)) throw new Error("Keine Artikelliste gefunden");
                if (!Array.isArray(backup)) {
                    const importEingenommen = backup.eingenommen ?? backup.meinAnteil ?? backup.meinWert;
                    if (importEingenommen !== undefined && importEingenommen !== null) {
                        localStorage.setItem("meinAnteil", String(importEingenommen).replace(",", "."));
                    }
                }
                const tx = db.transaction("artikel", "readwrite");
                const store = tx.objectStore("artikel");
                daten.forEach(x => {
                    delete x.id;
                    store.add(x);
                });
                tx.oncomplete = () => {
                    ladeAnteil();
                    render();
                };
            } catch (err) {
                alert("Import fehlgeschlagen. JSON-Datei ist ungültig.");
            }
        };
        reader.readAsText(file);
    });
}

function buildChatGptPrompt(artikel) {
    return `Erstelle mir bitte eine gute Kleinanzeigen-Verkaufsanzeige für diesen Artikel.

Bitte mache Folgendes:
1. Prüfe ungefähr den realistischen Verkaufspreis anhand vergleichbarer Angebote.
2. Gib mir eine faire Preisempfehlung in Euro, am besten mit VB.
3. Erstelle eine passende Überschrift.
4. Schreibe eine freundliche, ehrliche und verkaufsstarke Beschreibung.
5. Erwähne wichtige Details wie Zustand, Zubehör, Maße, Funktion und Besonderheiten.
6. Formuliere am Ende: Privatverkauf, keine Garantie und keine Rücknahme.
7. Falls Informationen fehlen, schreibe neutral und erfinde nichts.

Artikeldaten:
Name: ${artikel.title || ""}
Preisvorstellung: ${artikel.price || 0} €
Lagerort: ${artikel.location || ""}
Status: ${artikel.status || ""}
Notiz: ${artikel.note || ""}

Ich füge Bilder oder eine ZIP-Datei mit Bildern hinzu. Bitte nutze die Bilder, um Zustand und Details besser einzuschätzen.`;
}

function dataUrlToFile(dataUrl, fileName) {
    const parts = dataUrl.split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], fileName, { type: mime });
}

async function copyText(text) {
    try {
        if (navigator.clipboard) await navigator.clipboard.writeText(text);
    } catch (e) {
        console.warn("Kopieren nicht möglich", e);
    }
}

function zeigeDownloadDialog(blob, fileName) {
    const alt = document.getElementById("downloadDialog");
    if (alt) alt.remove();
    const url = URL.createObjectURL(blob);
    const box = document.createElement("div");
    box.id = "downloadDialog";
    box.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px";
    box.innerHTML = `<div style="background:white;max-width:360px;width:100%;border-radius:14px;padding:16px;box-shadow:0 8px 25px rgba(0,0,0,.25)"><h3 style="margin-top:0">Datei bereit</h3><p>Falls ChatGPT nicht in der Teilen-Liste erscheint, öffne ChatGPT manuell. Der Auftrag ist kopiert.</p><a href="${url}" download="${fileName}" style="display:block;text-align:center;background:#111;color:white;text-decoration:none;padding:12px;border-radius:10px;margin:12px 0">⬇️ ZIP speichern</a><button id="closeDownloadDialog" style="width:100%;padding:10px">Schließen</button></div>`;
    document.body.appendChild(box);
    g("closeDownloadDialog").onclick = () => {
        URL.revokeObjectURL(url);
        box.remove();
    };
}

async function chatGptExport(id) {
    const req = db.transaction("artikel", "readonly").objectStore("artikel").get(id);
    req.onsuccess = async () => {
        const artikel = req.result;
        if (!artikel) return;

        const prompt = buildChatGptPrompt(artikel);
        await copyText(prompt);

        const textFile = new File([prompt], "auftrag-chatgpt.txt", { type: "text/plain" });
        const imageFiles = (artikel.photos || [])
            .filter(p => p.data && p.data.includes(","))
            .map((p, i) => dataUrlToFile(p.data, `foto${i + 1}.jpg`));
        const files = [textFile, ...imageFiles];
        const title = "Kleinanzeige: " + (artikel.title || "Artikel");

        try {
            if (navigator.share) {
                if (navigator.canShare && navigator.canShare({ files })) {
                    await navigator.share({ title, text: prompt, files });
                    return;
                }
                await navigator.share({ title, text: prompt });
                return;
            }
        } catch (err) {
            if (err && err.name === "AbortError") return;
            console.warn("Teilen fehlgeschlagen", err);
        }

        const zip = new JSZip();
        zip.file("auftrag-chatgpt.txt", prompt);
        (artikel.photos || []).forEach((p, i) => {
            if (!p.data || !p.data.includes(",")) return;
            zip.file(`foto${i + 1}.jpg`, p.data.split(",")[1], { base64: true });
        });
        const blob = await zip.generateAsync({ type: "blob" });
        zeigeDownloadDialog(blob, safeFileName(artikel.title || "artikel") + ".zip");
        window.open("https://chatgpt.com/", "_blank");
        alert("Text wurde kopiert. Falls ChatGPT nicht in der Teilen-Liste erscheint, in ChatGPT einfügen und die ZIP/Bilder hochladen.");
    };
}

function safeFileName(name) {
    return name.replace(/[^a-z0-9äöüß_-]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "artikel";
}

async function render() {
    if (!db) return;
    const daten = await getAllArtikel();
    const q = (g("search").value || "").toLowerCase();
    g("items").innerHTML = "";
    g("sold").innerHTML = "";

    let active = 0;
    let fav = 0;
    let revenue = 0;
    let value = 0;

    daten.forEach(x => {
        if (!JSON.stringify(x).toLowerCase().includes(q)) return;
        if (x.favorite) fav++;

        const d = document.createElement("div");
        d.className = "card";
        d.innerHTML =
            (x.photos || []).map(p => `<img src="${p.data}">`).join("") +
            `<h3>${x.favorite ? "⭐ " : ""}${x.title || "Ohne Titel"}</h3>
            <p>${x.location || ""}</p>
            <p>${formatEuro(x.price || 0)}</p>
            <p>${x.note || ""}</p>
            <button onclick="editItem(${x.id})">✏️ Bearbeiten</button>
            <button onclick="delItem(${x.id})">🗑️ Löschen</button>
            <button onclick="chatGptExport(${x.id})">🤖 ChatGPT</button>`;

        if (x.status === "Verkauft") {
            revenue += x.price || 0;
            g("sold").appendChild(d);
        } else {
            active++;
            value += x.price || 0;
            const b = document.createElement("button");
            b.textContent = "💰 Verkauft";
            b.onclick = () => soldItem(x.id);
            d.appendChild(b);
            g("items").appendChild(d);
        }
    });

    const eingenommen = getGespeicherterAnteil();
    const ausgleich = berechneAusgleich(revenue, eingenommen);

    g("stats").innerHTML =
        "🤝 Mein Anteil: " + formatEuro(revenue / 2) +
        "<br><br>📦 Aktiv: " + active +
        " | ⭐ " + fav +
        "<br>💰 Umsatz: " + formatEuro(revenue) +
        "<br>🏷️ Lagerwert: " + formatEuro(value);

    if (g("meinAnteilAnzeige")) g("meinAnteilAnzeige").textContent = formatEuro(eingenommen);
    if (g("ausgleichAnzeige")) g("ausgleichAnzeige").textContent = ausgleich;
}

if (g("search")) g("search").oninput = render;
if (g("saveAnteil")) g("saveAnteil").onclick = speichereAnteil;
ladeAnteil();
