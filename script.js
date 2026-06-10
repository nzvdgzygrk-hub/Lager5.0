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

async function getAllArtikel() {

    return new Promise(resolve => {

        const tx = db.transaction("artikel", "readonly");

        const store = tx.objectStore("artikel");

        const req = store.getAll();

        req.onsuccess = () => resolve(req.result || []);
    });
}


