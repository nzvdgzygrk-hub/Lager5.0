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

function toggleForm() {
    g("form").classList.toggle("hidden");
}

function resizeImage(file, maxWidth = 600, quality = 0.6) {

    return new Promise(resolve => {

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

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    });
}

g("photos").addEventListener("change", async e => {

    const files = [...e.target.files];

    currentPhotos = [];

    g("preview").innerHTML = "";

    for (const file of files) {

        const photo = await resizeImage(file);

        currentPhotos.push(photo);

        const img = document.createElement("img");

        img.src = photo.data;

        g("preview").appendChild(img);
    }
});

function saveItem() {

    const artikel = {
        title: g("title").value,
        location: g("location").value,
        price: Number(g("price").value) || 0,
        favorite: g("favorite").checked,
        note: g("note").value,
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

        g("title").value = "";
        g("location").value = "";
        g("price").value = "";
        g("favorite").checked = false;
        g("note").value = "";
        g("photos").value = "";

        currentPhotos = [];

        g("preview").innerHTML = "";

        g("form").classList.add("hidden");

        render();
};

}

async function getAllArtikel() {

    return new Promise(resolve => {

        const tx = db.transaction("artikel", "readonly");
        const store = tx.objectStore("artikel");

        const req = store.getAll();

        req.onsuccess = () => {
            resolve(req.result || []);
        };
    });
}

async function soldItem(id) {

    const tx = db.transaction("artikel", "readwrite");
    const store = tx.objectStore("artikel");

    const req = store.get(id);

    req.onsuccess = () => {

        const artikel = req.result;

        artikel.status = "Verkauft";

        store.put(artikel);

        render();
    };
}

async function delItem(id) {

    if (!confirm("Löschen?")) return;

    const tx = db.transaction("artikel", "readwrite");

    tx.objectStore("artikel").delete(id);

    tx.oncomplete = render;
}

async function editItem(id) {

    const tx = db.transaction("artikel", "readonly");

    const req = tx.objectStore("artikel").get(id);

    req.onsuccess = () => {

        const x = req.result;

        g("title").value = x.title;
        g("location").value = x.location;
        g("price").value = x.price;
        g("favorite").checked = x.favorite;
        g("note").value = x.note;

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

    const artikel = await getAllArtikel();

    const blob = new Blob(
        [JSON.stringify(artikel, null, 2)],
        { type: "application/json" }
    );

    const a = document.createElement("a");

    a.href = URL.createObjectURL(blob);

    a.download = "lager5-backup.json";

    a.click();
}

g("importFile").addEventListener("change", e => {

    const file = e.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {

        const daten = JSON.parse(reader.result);

        const tx = db.transaction("artikel", "readwrite");

        const store = tx.objectStore("artikel");

        daten.forEach(x => {
            delete x.id;
            store.add(x);
        });

        tx.oncomplete = render;
    };

    reader.readAsText(file);
});

async function chatGptExport(id) {

    const tx = db.transaction("artikel", "readonly");

    const req = tx.objectStore("artikel").get(id);

    req.onsuccess = () => {

        const artikel = req.result;

        const blob = new Blob(
            [JSON.stringify(artikel, null, 2)],
            { type: "application/json" }
        );

        const a = document.createElement("a");

        a.href = URL.createObjectURL(blob);

        a.download =
            (artikel.title || "artikel")
            .replace(/[^a-z0-9]/gi, "_")
            + "_chatgpt.json";

        a.click();
    };
}

async function render() {
async function render() {

    const daten = await getAllArtikel();

    const q = (g("search").value || "").toLowerCase();

    let active = 0;
    let fav = 0;
    let revenue = 0;
    let value = 0;

    g("items").innerHTML = "";
    g("sold").innerHTML = "";

    daten.forEach(x => {

        if (!JSON.stringify(x).toLowerCase().includes(q))
            return;

        if (x.favorite)
            fav++;

        const d = document.createElement("div");

        d.className = "card";

        d.innerHTML =
            (x.photos || [])
            .map(p => `<img src="${p.data}">`)
            .join("") +

            `<h3>${x.favorite ? "⭐ " : ""}${x.title}</h3>
             <p>${x.location}</p>
             <p>${x.price} €</p>
             <p>${x.note || ""}</p>

             <button onclick="editItem(${x.id})">
✏️ Bearbeiten
</button>

<button onclick="delItem(${x.id})">
🗑️ Löschen
</button>

<button onclick="chatGptExport(${x.id})">
🤖 ChatGPT
</button>

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
}

g("search").oninput = render;


