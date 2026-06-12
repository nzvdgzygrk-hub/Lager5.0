let db;
let editId = null;
let currentPhotos = [];

const g = id => document.getElementById(id);

const request = indexedDB.open("lager5", 1);

request.onupgradeneeded = e => {
    db = e.target.result;

    if (!db.objectStoreNames.contains("artikel")) {
        db.createObjectStore("artikel", {
            keyPath: "id",
            autoIncrement: true
        });
    }
};

request.onsuccess = e => {
    db = e.target.result;
    render();
};

request.onerror = e => {
    alert("Datenbank konnte nicht geöffnet werden.");
    console.error(e);
};

function toggleForm() {
    g("form").classList.toggle("hidden");
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

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                resolve({
                    name: file.name,
                    data: canvas.toDataURL("image/jpeg", quality)
                });
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
        const req = db
            .transaction("artikel", "readonly")
            .objectStore("artikel")
            .getAll();

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

    tx.onerror = () => {
        alert("Speichern fehlgeschlagen. Speicher eventuell voll.");
    };
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
    const req = db
        .transaction("artikel", "readonly")
        .objectStore("artikel")
        .get(id);

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

    const blob = new Blob(
        [JSON.stringify(daten, null, 2)],
        { type: "application/json" }
    );

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
                const daten = JSON.parse(reader.result);
                const tx = db.transaction("artikel", "readwrite");
                const store = tx.objectStore("artikel");

                daten.forEach(x => {
                    delete x.id;
                    store.add(x);
                });

                tx.oncomplete = render;
            } catch (err) {
                alert("Import fehlgeschlagen. JSON-Datei ist ungültig.");
            }
        };

        reader.readAsText(file);
    });
}

function chatGptExport(id) {
    const req = db
        .transaction("artikel", "readonly")
        .objectStore("artikel")
        .get(id);

    req.onsuccess = async () => {
        const artikel = req.result;
        if (!artikel) return;

        const zip = new JSZip();

        zip.file(
            "artikel.txt",
`Titel: ${artikel.title || ""}
Preis: ${artikel.price || 0} €
Lagerort: ${artikel.location || ""}
Status: ${artikel.status || ""}

Notiz:
${artikel.note || ""}`
        );

        (artikel.photos || []).forEach((p, i) => {
            if (!p.data || !p.data.includes(",")) return;

            zip.file(
                `foto${i + 1}.jpg`,
                p.data.split(",")[1],
                { base64: true }
            );
        });

        const blob = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");

        a.href = URL.createObjectURL(blob);
        a.download = safeFileName(artikel.title || "artikel") + ".zip";
        a.click();
    };
}

function safeFileName(name) {
    return name
        .replace(/[^a-z0-9äöüß_-]/gi, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "") || "artikel";
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
            (x.photos || [])
                .map(p => `<img src="${p.data}">`)
                .join("") +
            `<h3>${x.favorite ? "⭐ " : ""}${x.title || "Ohne Titel"}</h3>
            <p>${x.location || ""}</p>
            <p>${x.price || 0} €</p>
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

    g("stats").innerHTML =
        "📦 Aktiv: " + active +
        " | ⭐ " + fav +
        " | 💰 Umsatz: " + revenue + " €" +
        " | 🏷️ Lagerwert: " + value + " €";

    const feld = g("meinAnteil");

if (feld) {
    feld.value = localStorage.getItem("meinAnteil") || "";
}

if (g("search")) {
    g("search").oninput = render;
}
document.addEventListener("input", e => {
    if (e.target.id === "meinAnteil") {
        localStorage.setItem(
            "meinAnteil",
            e.target.value || ""
        );
    }
});

