/* =========================================================
   U MAP AI
   CLEAN FRONTEND - STABLE VERSION
   ========================================================= */


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let map = null;

let markers = [];

let currentLocation = null;

let userMarker = null;

let accuracyCircle = null;

let streetLayer = null;

let satelliteLayer = null;

let satelliteEnabled = false;


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function safeUrl(value) {

    const url = String(value ?? "");

    if (
        url.startsWith("https://") ||
        url.startsWith("http://")
    ) {
        return url;
    }

    return "#";
}


async function fetchJson(url, options = {}) {

    const response = await fetch(
        url,
        {
            ...options,
            headers: {
                "Accept": "application/json",
                ...(options.headers || {})
            }
        }
    );

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error(
            `Server returned HTTP ${response.status}`
        );
    }

    if (!response.ok) {

        throw new Error(
            data.error ||
            data.message ||
            `Request failed (${response.status})`
        );
    }

    return data;
}


/* =========================================================
   MAP
   ========================================================= */

function initializeMap() {

    const mapElement =
        document.getElementById("map");

    if (!mapElement) {
        console.warn("Map element not found.");
        return;
    }


    /* Leaflet is loaded before app.js in index.html */

    if (
        typeof L === "undefined"
    ) {

        mapElement.innerHTML = `
            <div style="
                height:100%;
                display:flex;
                align-items:center;
                justify-content:center;
                flex-direction:column;
                text-align:center;
                padding:30px;
            ">
                <div style="font-size:42px;">🗺️</div>

                <h3>Map unavailable</h3>

                <p>
                    Please check your internet connection
                    and refresh the page.
                </p>
            </div>
        `;

        return;
    }


    /* Prevent duplicate map creation */

    if (map) {

        try {
            map.remove();
        } catch (error) {
            console.warn(error);
        }

        map = null;
    }


    try {

        map = L.map("map")
            .setView(
                [20.5937, 78.9629],
                5
            );


        streetLayer =
            L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    maxZoom: 19,

                    attribution:
                        "&copy; OpenStreetMap contributors"
                }
            );


        streetLayer.addTo(map);


        satelliteLayer =
            L.tileLayer(
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                {
                    maxZoom: 19,

                    attribution:
                        "Tiles &copy; Esri"
                }
            );


        satelliteEnabled = false;


        setTimeout(
            () => {

                if (map) {
                    map.invalidateSize();
                }

            },
            300
        );


        console.log(
            "U Map map ready."
        );

    } catch (error) {

        console.error(
            "Map initialization failed:",
            error
        );
    }
}


/* =========================================================
   SATELLITE
   ========================================================= */

function toggleSatellite() {

    if (
        !map ||
        !streetLayer ||
        !satelliteLayer
    ) {
        return;
    }


    satelliteEnabled =
        !satelliteEnabled;


    if (satelliteEnabled) {

        if (
            map.hasLayer(
                streetLayer
            )
        ) {
            map.removeLayer(
                streetLayer
            );
        }

        satelliteLayer.addTo(map);

    } else {

        if (
            map.hasLayer(
                satelliteLayer
            )
        ) {
            map.removeLayer(
                satelliteLayer
            );
        }

        streetLayer.addTo(map);
    }


    const button =
        document.getElementById(
            "satelliteToggle"
        );


    if (button) {

        button.innerText =
            satelliteEnabled
                ? "🗺️ Street Map"
                : "🛰️ Satellite";

        button.classList.toggle(
            "active",
            satelliteEnabled
        );
    }


    setTimeout(
        () => {

            if (map) {
                map.invalidateSize();
            }

        },
        200
    );
}


/* =========================================================
   MARKERS
   ========================================================= */

function clearMarkers() {

    if (!map) {
        markers = [];
        return;
    }


    markers.forEach(
        marker => {

            try {
                map.removeLayer(marker);
            } catch {
                /* ignore */
            }

        }
    );


    markers = [];
}


function addMarker(
    latitude,
    longitude,
    title,
    popupHtml = ""
) {

    if (
        !map ||
        latitude == null ||
        longitude == null
    ) {
        return null;
    }


    const marker =
        L.marker(
            [
                Number(latitude),
                Number(longitude)
            ]
        );


    marker.addTo(map);


    if (popupHtml) {

        marker.bindPopup(
            popupHtml
        );

    } else {

        marker.bindPopup(
            escapeHtml(title || "Place")
        );
    }


    markers.push(marker);

    return marker;
}


/* =========================================================
   CURRENT LOCATION
   ========================================================= */

function useCurrentLocation(
    autoSearch = false
) {

    const button =
        document.getElementById(
            "locationButton"
        );


    const status =
        document.getElementById(
            "locationStatus"
        );


    if (
        !navigator.geolocation
    ) {

        if (status) {
            status.innerText =
                "Location is not supported by this browser.";
        }

        return;
    }


    if (button) {

        button.disabled = true;

        button.innerText =
            "📍 Finding you...";
    }


    if (status) {

        status.innerText =
            "Getting your current location...";
    }


    navigator.geolocation.getCurrentPosition(

        async position => {

            const latitude =
                position.coords.latitude;

            const longitude =
                position.coords.longitude;

            const accuracy =
                position.coords.accuracy;


            currentLocation = {
                latitude,
                longitude,
                accuracy
            };


            /* Center map */

            if (map) {

                map.setView(
                    [
                        latitude,
                        longitude
                    ],
                    16
                );


                if (userMarker) {

                    try {
                        map.removeLayer(
                            userMarker
                        );
                    } catch {}
                }


                if (accuracyCircle) {

                    try {
                        map.removeLayer(
                            accuracyCircle
                        );
                    } catch {}
                }


                userMarker =
                    L.marker(
                        [
                            latitude,
                            longitude
                        ]
                    )
                    .addTo(map)
                    .bindPopup(
                        "📍 You are here"
                    );


                accuracyCircle =
                    L.circle(
                        [
                            latitude,
                            longitude
                        ],
                        {
                            radius: accuracy,

                            weight: 1
                        }
                    )
                    .addTo(map);
            }


            /* Reverse-geocode to get locality name */

            const locationInput =
                document.getElementById(
                    "mainLocation"
                );

            const statusEl =
                document.getElementById(
                    "locationStatus"
                );


            let detectedCity = null;

            try {
                const revResp = await fetch(
                    `/api/detect-city?lat=${latitude}&lon=${longitude}`
                );
                if (revResp.ok) {
                    const revData = await revResp.json();
                    if (revData.city) {
                        detectedCity = revData.city;
                    }
                }
            } catch (revErr) {
                console.warn("Reverse geocode error:", revErr);
            }


            if (locationInput) {

                locationInput.value =
                    detectedCity
                        ? `📍 ${detectedCity}`
                        : "📍 Current location";
            }


            if (statusEl) {

                statusEl.innerText = detectedCity
                    ? `📍 ${detectedCity} detected • ±${Math.round(accuracy)} m accuracy`
                    : `Location ready • ±${Math.round(accuracy)} m accuracy`;
            }


            if (button) {

                button.disabled = false;

                button.innerText =
                    "📍 Use my current location";
            }


            updateStreetViewLink();


            if (autoSearch) {

                performSearch();
            }

        },

        error => {

            if (button) {

                button.disabled = false;

                button.innerText =
                    "📍 Use my current location";
            }


            let message =
                "Could not get your location.";


            if (
                error.code ===
                error.PERMISSION_DENIED
            ) {

                message =
                    "Location permission was denied. Allow location access and try again.";

            } else if (
                error.code ===
                error.POSITION_UNAVAILABLE
            ) {

                message =
                    "Your location is currently unavailable.";

            } else if (
                error.code ===
                error.TIMEOUT
            ) {

                message =
                    "Location request timed out.";
            }


            if (status) {
                status.innerText =
                    message;
            }


            console.warn(
                "Geolocation error:",
                error
            );
        },

        {
            enableHighAccuracy: true,

            timeout: 15000,

            maximumAge: 0
        }
    );
}


/* =========================================================
   STREET VIEW
   ========================================================= */

function getStreetViewUrl(
    latitude,
    longitude
) {

    return (
        "https://www.google.com/maps/@?api=1" +
        "&map_action=pano" +
        "&viewpoint=" +
        encodeURIComponent(
            `${latitude},${longitude}`
        )
    );
}


function updateStreetViewLink(lat = null, lng = null) {

    const link =
        document.getElementById(
            "currentStreetView"
        );

    if (!link) {
        return;
    }

    const useLat = (lat != null) ? lat : (currentLocation ? currentLocation.latitude : (window.lastSearchedCoords ? window.lastSearchedCoords.latitude : null));
    const useLng = (lng != null) ? lng : (currentLocation ? currentLocation.longitude : (window.lastSearchedCoords ? window.lastSearchedCoords.longitude : null));

    if (useLat == null || useLng == null) {
        return;
    }

    link.href =
        getStreetViewUrl(
            useLat,
            useLng
        );

    link.classList.add(
        "ready"
    );
}


function openCurrentStreetView() {

    let lat = currentLocation ? currentLocation.latitude : null;
    let lng = currentLocation ? currentLocation.longitude : null;

    if (lat == null || lng == null) {
        if (window.lastSearchedCoords && window.lastSearchedCoords.latitude != null && window.lastSearchedCoords.longitude != null) {
            lat = window.lastSearchedCoords.latitude;
            lng = window.lastSearchedCoords.longitude;
        }
    }

    if (lat == null || lng == null) {
        useCurrentLocation(false);
        alert(
            "Please search for a place or allow location access first."
        );
        return false;
    }

    const url =
        getStreetViewUrl(
            lat,
            lng
        );

    window.open(
        url,
        "_blank",
        "noopener"
    );

    return false;
}


/* =========================================================
   SEARCH
   ========================================================= */

async function performSearch(mode = "explore") {

    const queryInput =
        document.getElementById(
            "mainQuery"
        );

    const locationInput =
        document.getElementById(
            "mainLocation"
        );

    const resultsBox =
        document.getElementById(
            "results"
        );

    const count =
        document.getElementById(
            "resultCount"
        );

    const rawQuery =
        (
            queryInput?.value ||
            ""
        ).trim();

    // Strip any "📍 " prefix that was inserted by reverse-geocode display
    const rawLocation =
        (
            locationInput?.value ||
            ""
        ).trim().replace(/^📍\s*/, "");

    // Determine if this is truly a current-location search
    // (field shows "Current location" or detected city from GPS, not a typed address)
    const isCurrentLocationSearch =
        currentLocation != null &&
        (
            locationInput?.value.trim() === "" ||
            locationInput?.value.trim().startsWith("📍") ||
            locationInput?.value.trim().toLowerCase() === "current location"
        );

    document
        .getElementById("explore")
        ?.scrollIntoView(
            {
                behavior: "smooth",
                block: "start"
            }
        );

    if (resultsBox) {
        resultsBox.innerHTML = `
            <div class="empty-state">
                <div>🔎</div>
                <h3>Searching...</h3>
                <p>Finding places worldwide using real data.</p>
            </div>
        `;
    }

    if (count) {
        count.innerText = "Searching...";
    }

    let finalQuery = "";
    let finalLocation = "";
    let useCoordinates = false;

    if (mode === "place") {
        if (!rawQuery && !rawLocation) {
            if (currentLocation) {
                finalQuery = "places near me";
                useCoordinates = true;
            } else {
                if (resultsBox) {
                    resultsBox.innerHTML = `
                        <div class="empty-state">
                            <div>📍</div>
                            <h3>Place or location needed</h3>
                            <p>Please enter any hotel, residency, restaurant, landmark, attraction, airport, business, or location worldwide.</p>
                        </div>
                    `;
                }
                if (count) count.innerText = "Ready";
                return;
            }
        } else if (rawQuery && !rawLocation) {
            finalQuery = rawQuery;
            if (isCurrentLocationSearch) useCoordinates = true;
        } else if (!rawQuery && rawLocation) {
            finalQuery = rawLocation;
            finalLocation = rawLocation;
        } else {
            finalQuery = rawQuery;
            finalLocation = rawLocation;
        }
    } else {
        // Explore mode: explore destinations, cities, or points of interest
        if (!rawQuery && !rawLocation) {
            if (currentLocation) {
                finalQuery = "top attractions and places near me";
                useCoordinates = true;
            } else {
                if (resultsBox) {
                    resultsBox.innerHTML = `
                        <div class="empty-state">
                            <div>🧭</div>
                            <h3>Destination needed</h3>
                            <p>Please enter any valid global city, country, landmark, or destination to explore, or click "Use my current location".</p>
                        </div>
                    `;
                }
                if (count) count.innerText = "Ready";
                return;
            }
        } else if (rawLocation && !rawQuery) {
            finalQuery = `top attractions and places in ${rawLocation}`;
            finalLocation = rawLocation;
        } else if (rawQuery && !rawLocation) {
            finalQuery = rawQuery;
            if (isCurrentLocationSearch) useCoordinates = true;
        } else {
            finalQuery = `${rawQuery} in ${rawLocation}`;
            finalLocation = rawLocation;
        }
    }

    const params = new URLSearchParams();
    params.set("q", finalQuery);

    if (finalLocation) {
        params.set("location", finalLocation);
    }

    // Send GPS coordinates when using current location
    if (isCurrentLocationSearch && currentLocation) {
        params.set("lat", String(currentLocation.latitude));
        params.set("lng", String(currentLocation.longitude));
    } else if (useCoordinates && currentLocation) {
        params.set("lat", String(currentLocation.latitude));
        params.set("lng", String(currentLocation.longitude));
    }

    const foodBudget = document.getElementById("foodBudget");
    const foodOpenNow = document.getElementById("foodOpenNow");

    if (foodBudget && foodBudget.value.trim()) {
        params.set("budget", foodBudget.value.trim());
    }

    if (foodOpenNow && foodOpenNow.checked) {
        params.set("open_now", "1");
    }

    try {
        const data = await fetchJson(`/api/search?${params.toString()}`);

        // Handle explicit "location not found" from backend
        if (data.location_not_found) {
            if (resultsBox) {
                resultsBox.innerHTML = `
                    <div class="empty-state">
                        <div>🔍</div>
                        <h3>Location not found</h3>
                        <p>Location not found. Please try a more specific place or address.</p>
                    </div>
                `;
            }
            if (count) count.innerText = "0 places";
            const status = document.getElementById("locationStatus");
            if (status) status.innerText = "Location not found. Please try a more specific place or address.";
            return;
        }

        displayResults(data.results || [], data.coordinates || null);

        if (count) {
            count.innerText = `${(data.results || []).length} places`;
        }

        const status = document.getElementById("locationStatus");
        if (status) {
            if (data.results && data.results.length > 0) {
                const locLabel = data.coordinates?.display_name
                    ? data.coordinates.display_name.split(",")[0]
                    : (finalLocation || finalQuery);
                status.innerText = `Showing results near ${locLabel}.`;
            } else {
                status.innerText = `No places found for "${finalQuery}". Location not found. Please try a more specific place or address.`;
            }
        }
    } catch (error) {
        console.error("Search error:", error);
        if (resultsBox) {
            resultsBox.innerHTML = `
                <div class="empty-state">
                    <div>⚠️</div>
                    <h3>Search failed</h3>
                    <p>${escapeHtml(error.message)}</p>
                    <p>Please try again.</p>
                </div>
            `;
        }
        if (count) {
            count.innerText = "Error";
        }
    }
}

async function performPlaceSearch() {
    return performSearch("place");
}

async function performExplore() {
    return performSearch("explore");
}

window.performPlaceSearch = performPlaceSearch;
window.performExplore = performExplore;
window.performSearch = performSearch;


/* =========================================================
   DISPLAY SEARCH RESULTS
   ========================================================= */

function displayResults(
    places,
    coordinates = null
) {

    const resultsBox =
        document.getElementById(
            "results"
        );


    const count =
        document.getElementById(
            "resultCount"
        );


    clearMarkers();


    if (
        !places ||
        places.length === 0
    ) {

        if (resultsBox) {

            resultsBox.innerHTML = `
                <div class="empty-state">

                    <div>🧭</div>

                    <h3>
                        No places found
                    </h3>

                    <p>
                        Try another search.
                    </p>

                </div>
            `;
        }


        if (count) {
            count.innerText =
                "0 results";
        }


        return;
    }


    const html =
        places.map(
            (place, index) => {

                const title =
                    place.title ||
                    "Place";


                const rating =
                    place.rating ??
                    "—";


                const reviews =
                    place.reviews ??
                    0;


                const address =
                    place.address ||
                    "Address unavailable";


                const phone =
                    place.phone ||
                    "";


                const dataId =
                    place.data_id ||
                    "";


                const latitude =
                    place.latitude;


                const longitude =
                    place.longitude;


                const website =
                    safeUrl(
                        place.website
                    );


                const directions =
                    safeUrl(
                        place.directions
                    );


                /* Add marker */

                if (
                    latitude != null &&
                    longitude != null
                ) {

                    addMarker(
                        latitude,
                        longitude,
                        title,
                        `
                            <strong>
                                ${escapeHtml(title)}
                            </strong>
                            <br>
                            ${escapeHtml(address)}
                        `
                    );
                }


                const reviewButton =
                    (dataId || place.place_id || title)
                        ? `
                            <button
                                type="button"
                                class="review-button"
                                data-review-id="${escapeHtml(dataId)}"
                                data-place-id="${escapeHtml(place.place_id || '')}"
                                data-place-query="${escapeHtml(title)}"
                            >
                                ⭐ Reviews
                            </button>
                        `
                        : "";


                const websiteButton =
                    (website && website !== "#")
                        ? `
                            <a
                                href="${website}"
                                target="_blank"
                                rel="noopener"
                                class="result-link"
                            >
                                Website
                            </a>
                        `
                        : "";


                const directionButton =
                    (directions && directions !== "#")
                        ? `
                            <a
                                href="${directions}"
                                target="_blank"
                                rel="noopener"
                                class="result-link"
                            >
                                Directions
                            </a>
                        `
                        : ""; 

                const streetViewButton =
                    (latitude != null && longitude != null)
                        ? `
                            <button
                                type="button"
                                class="result-link street-view-place-button"
                                data-lat="${escapeHtml(latitude)}"
                                data-lng="${escapeHtml(longitude)}"
                            >
                                📍 Street View
                            </button>
                        `
                        : `
                            <span class="street-view-na">
                                📍 Street View: Not available
                            </span>
                        `;

                const virtualTourButton =
                    place.virtual_tour_url
                        ? `
                            <a
                                href="${safeUrl(place.virtual_tour_url)}"
                                target="_blank"
                                rel="noopener"
                                class="result-link virtual-tour-btn"
                            >
                                🌐 Virtual Tour
                            </a>
                        `
                        : `
                            <span class="virtual-tour-na">
                                🌐 Virtual Tour: Not available
                            </span>
                        `;


                return `
                    <article
                        class="place-card"
                        data-index="${index}"
                    >

                        <div class="place-card-top">

                            <div>

                                <h3>
                                    ${escapeHtml(title)}
                                </h3>

                                <p class="place-type">
                                    ${escapeHtml(
                                        place.type || "Place"
                                    )}
                                </p>

                            </div>

                            <div class="place-rating">
                                ⭐ ${escapeHtml(rating)}
                            </div>

                        </div>


                        <p>
                            📍 ${escapeHtml(address)}
                        </p>


                        ${
                            phone
                                ? `
                                    <p>
                                        📞 ${escapeHtml(phone)}
                                    </p>
                                `
                                : ""
                        }


                        <p>
                            ${escapeHtml(
                                String(reviews)
                            )}
                            reviews
                        </p>


                        <div class="place-actions">

                            ${reviewButton}

                            ${websiteButton}

                            ${directionButton}

                            ${streetViewButton}

                            ${virtualTourButton}

                        </div> 

                    </article>
                `;
            }
        )
        .join("");


    if (resultsBox) {
        resultsBox.innerHTML =
            html;
    }


    if (count) {
        count.innerText =
            `${places.length} places`;
    }


    /*
       Map centering priority:
       1. Authoritative coordinates (geocoded city center or browser GPS) — always center here first.
       2. If results have valid GPS, fit bounds around them — but only if they are near the searched location.
       3. Fallback: center on coordinates if no results have GPS.
    */

    // Step 1: Record lastSearchedCoords (for street view etc.)
    if (coordinates && coordinates.latitude != null && coordinates.longitude != null) {
        window.lastSearchedCoords = coordinates;
        updateStreetViewLink(coordinates.latitude, coordinates.longitude);
    } else if (places.length > 0 && places[0].latitude != null && places[0].longitude != null) {
        window.lastSearchedCoords = {
            latitude: places[0].latitude,
            longitude: places[0].longitude
        };
        updateStreetViewLink(places[0].latitude, places[0].longitude);
    }

    if (!map) return;

    const validPlaces = places.filter(
        place => place.latitude != null && place.longitude != null
    );

    // Always center on the authoritative searched location first
    if (coordinates && coordinates.latitude != null && coordinates.longitude != null) {
        const centerLat = Number(coordinates.latitude);
        const centerLng = Number(coordinates.longitude);

        if (validPlaces.length === 0) {
            // No result markers — just center on the searched location
            map.setView([centerLat, centerLng], 14);
        } else if (validPlaces.length === 1) {
            // Single result — center on it
            map.setView([Number(validPlaces[0].latitude), Number(validPlaces[0].longitude)], 15);
        } else {
            // Multiple results — fit bounds, but ensure the searched location is the anchor
            const bounds = L.latLngBounds(
                validPlaces.map(place => [
                    Number(place.latitude),
                    Number(place.longitude)
                ])
            );

            try {
                map.fitBounds(
                    bounds,
                    {
                        padding: [30, 30],
                        maxZoom: 15
                    }
                );
            } catch (boundsErr) {
                console.warn("Could not fit map bounds:", boundsErr);
                map.setView([centerLat, centerLng], 13);
            }
        }
    } else if (validPlaces.length > 0) {
        // No authoritative coords — use result markers
        if (validPlaces.length === 1) {
            map.setView([Number(validPlaces[0].latitude), Number(validPlaces[0].longitude)], 15);
        } else {
            const bounds = L.latLngBounds(
                validPlaces.map(place => [
                    Number(place.latitude),
                    Number(place.longitude)
                ])
            );

            try {
                map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
            } catch (boundsErr) {
                console.warn("Could not fit map bounds:", boundsErr);
            }
        }
    }
}


/* =========================================================
   QUICK SEARCH
   ========================================================= */

function quickSearch(
    query
) {

    const input =
        document.getElementById(
            "mainQuery"
        );


    if (input) {
        input.value =
            query;
    }


    document
        .getElementById("explore")
        ?.scrollIntoView(
            {
                behavior: "smooth",
                block: "start"
            }
        );


    if (currentLocation) {

        performSearch();

    } else {

        const location =
            document.getElementById(
                "mainLocation"
            );


        if (
            location &&
            location.value.trim()
        ) {

            performSearch();

        } else {

            useCurrentLocation(
                true
            );
        }
    }
}


/* =========================================================
   FOOD THAT FITS YOU - PERSONALIZED FOOD & TRIP MEAL PLAN
   ========================================================= */

let currentFoodPlanData = null;
let currentActiveFoodDay = "all";

async function syncFoodLocation() {
    const foodLocInput = document.getElementById("foodLocation");
    const syncBtn = document.querySelector(".food-location-sync-btn");
    if (!foodLocInput) return;

    const originalBtnText = syncBtn ? syncBtn.innerHTML : "🎯 Current";
    if (syncBtn) {
        syncBtn.innerHTML = "⏳ Locating...";
        syncBtn.disabled = true;
    }

    const applyCity = (cityName) => {
        if (!cityName) return false;
        foodLocInput.value = cityName;
        foodLocInput.style.borderColor = "var(--green)";
        setTimeout(() => { foodLocInput.style.borderColor = ""; }, 2000);
        if (syncBtn) {
            syncBtn.innerHTML = "✅ Found!";
            setTimeout(() => {
                syncBtn.innerHTML = originalBtnText;
                syncBtn.disabled = false;
            }, 1800);
        }
        return true;
    };

    // 1. If currentLocation already has coordinates, resolve city immediately
    if (window.currentLocation && window.currentLocation.latitude && window.currentLocation.longitude) {
        try {
            const res = await fetch(`/api/detect-city?lat=${window.currentLocation.latitude}&lon=${window.currentLocation.longitude}`);
            if (res.ok) {
                const data = await res.json();
                if (data.city && applyCity(data.city)) return;
            }
        } catch (e) {
            console.warn("Cached coordinates geocode error:", e);
        }
    }

    // 2. Try browser geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                window.currentLocation = {
                    latitude: lat,
                    longitude: lon,
                    accuracy: pos.coords.accuracy
                };
                try {
                    const res = await fetch(`/api/detect-city?lat=${lat}&lon=${lon}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.city && applyCity(data.city)) return;
                    }
                } catch (e) {
                    console.warn("Geolocation reverse geocode error:", e);
                }
                fallbackToIpCity();
            },
            (err) => {
                console.warn("Browser geolocation failed/denied, falling back to IP:", err);
                fallbackToIpCity();
            },
            { timeout: 7000, enableHighAccuracy: true }
        );
    } else {
        fallbackToIpCity();
    }

    async function fallbackToIpCity() {
        // Check mainLocation first if it's an actual city name (not "Current location")
        const mainLoc = document.getElementById("mainLocation");
        if (mainLoc && mainLoc.value.trim() && !mainLoc.value.toLowerCase().includes("current")) {
            if (applyCity(mainLoc.value.trim())) return;
        }

        try {
            const res = await fetch("/api/detect-city");
            if (res.ok) {
                const data = await res.json();
                if (data.city && applyCity(data.city)) return;
            }
        } catch (e) {
            console.error("IP city fallback error:", e);
        }

        if (syncBtn) {
            syncBtn.innerHTML = originalBtnText;
            syncBtn.disabled = false;
        }
        foodLocInput.focus();
        foodLocInput.placeholder = "Please type your city (e.g. Chennai, Paris)...";
    }
}

function onHealthRestrictionChange() {
    const select = document.getElementById("foodHealthRestriction");
    const custom = document.getElementById("foodHealthCustom");
    if (!select || !custom) return;

    if (select.value === "Other dietary restriction") {
        custom.style.display = "block";
        custom.focus();
    } else {
        custom.style.display = "none";
    }
}

function onFoodPrefChange() {
    // Optional dynamic adjustments if needed
}

function applyFoodPreset(loc, foodP, dietP, healthR, budget, duration) {
    const locInput = document.getElementById("foodLocation");
    const foodPrefSelect = document.getElementById("foodPreference");
    const dietPrefSelect = document.getElementById("foodDietaryPreference");
    const healthSelect = document.getElementById("foodHealthRestriction");
    const budgetInput = document.getElementById("foodBudget");
    const durationInput = document.getElementById("foodDuration");
    const customHealth = document.getElementById("foodHealthCustom");

    if (locInput) locInput.value = loc;
    if (foodPrefSelect) foodPrefSelect.value = foodP;
    if (dietPrefSelect) dietPrefSelect.value = dietP;
    if (healthSelect) {
        healthSelect.value = healthR;
        if (customHealth) customHealth.style.display = "none";
    }
    if (budgetInput) budgetInput.value = budget;
    if (durationInput) durationInput.value = duration;

    generateFoodPlan();
}

async function generateFoodPlan() {
    const locInput = document.getElementById("foodLocation");
    const foodPrefSelect = document.getElementById("foodPreference");
    const dietPrefSelect = document.getElementById("foodDietaryPreference");
    const healthSelect = document.getElementById("foodHealthRestriction");
    const customHealthInput = document.getElementById("foodHealthCustom");
    const budgetInput = document.getElementById("foodBudget");
    const durationInput = document.getElementById("foodDuration");

    const location = locInput ? locInput.value.trim() : "";
    if (!location) {
        if (locInput) {
            locInput.focus();
            locInput.style.borderColor = "var(--pink)";
            setTimeout(() => { locInput.style.borderColor = ""; }, 2500);
        }
        alert("Please enter a destination city or area (e.g. Chennai, Delhi, Paris).");
        return;
    }

    const foodPreference = foodPrefSelect ? foodPrefSelect.value : "Vegetarian";
    const dietaryPreference = dietPrefSelect ? dietPrefSelect.value : "Traditional Local Cuisine";
    
    let healthRestriction = healthSelect ? healthSelect.value : "None";
    if (healthRestriction === "Other dietary restriction" && customHealthInput && customHealthInput.value.trim()) {
        healthRestriction = customHealthInput.value.trim();
    }

    const budget = budgetInput && budgetInput.value ? parseInt(budgetInput.value, 10) : 600;
    const duration = durationInput && durationInput.value ? parseInt(durationInput.value, 10) : 7;

    // UI Loading state
    const loadingBox = document.getElementById("foodLoading");
    const resultsBox = document.getElementById("foodResults");
    const submitBtn = document.getElementById("foodSubmitBtn");
    const spinner = document.getElementById("foodBtnSpinner");
    const btnText = document.getElementById("foodBtnText");
    const loadingLoc = document.getElementById("foodLoadingLoc");

    if (loadingLoc) loadingLoc.textContent = location;
    if (loadingBox) loadingBox.style.display = "block";
    if (resultsBox) resultsBox.style.display = "none";
    if (spinner) spinner.style.display = "inline-block";
    if (btnText) btnText.textContent = "Crafting Your Plan...";
    if (submitBtn) submitBtn.disabled = true;

    // Scroll to loading indicator
    loadingBox?.scrollIntoView({ behavior: "smooth", block: "center" });

    try {
        const response = await fetch("/api/food-plan", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                location: location,
                food_preference: foodPreference,
                dietary_preference: dietaryPreference,
                health_restriction: healthRestriction,
                budget: budget,
                duration: duration
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to generate food recommendations.");
        }

        currentFoodPlanData = data;
        renderFoodPlanResults(data);

        if (loadingBox) loadingBox.style.display = "none";
        if (resultsBox) {
            resultsBox.style.display = "block";
            resultsBox.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    } catch (err) {
        console.error("Food Plan Error:", err);
        if (loadingBox) loadingBox.style.display = "none";
        alert("Could not generate food plan: " + (err.message || "Please check your network connection and try again."));
    } finally {
        if (spinner) spinner.style.display = "none";
        if (btnText) btnText.textContent = "✨ Generate Top Foods & Week-Long Meal Plan";
        if (submitBtn) submitBtn.disabled = false;
    }
}

function renderFoodPlanResults(data) {
    // 0. Update print title
    const printTitle = document.querySelector(".food-print-title");
    if (printTitle && data.location) {
        printTitle.textContent = `Food That Fits You · ${data.location} (${data.duration}-Day Plan)`;
    }

    // 1. Update summary badges
    const summaryLoc = document.getElementById("summaryLocation");
    const summaryDiet = document.getElementById("summaryDiet");
    const summaryHealth = document.getElementById("summaryHealth");
    const summaryBudget = document.getElementById("summaryBudget");
    const summaryDuration = document.getElementById("summaryDuration");

    if (summaryLoc) summaryLoc.textContent = `📍 ${data.location}`;
    if (summaryDiet) summaryDiet.textContent = `🥗 ${data.food_preference} · ${data.dietary_preference}`;
    if (summaryHealth) {
        summaryHealth.textContent = data.health_restriction && data.health_restriction !== "None" 
            ? `🩺 ${data.health_restriction}` 
            : `🩺 Standard Dietary`;
    }
    if (summaryBudget) summaryBudget.textContent = `💰 Target: ₹${data.budget}/day`;
    if (summaryDuration) summaryDuration.textContent = `📅 ${data.duration} Days Plan`;

    // 2. Allergy & Verification Warning
    const noticeBox = document.getElementById("foodAllergyNoticeBox");
    const noticeText = document.getElementById("foodAllergyNoticeText");
    const hasRestriction = data.health_restriction && data.health_restriction !== "None";

    if (noticeBox) {
        noticeBox.style.display = "flex";
        if (noticeText) {
            noticeText.textContent = data.allergy_reminder || (
                "Dietary & Health Reminder: Health information is treated strictly as dietary preferences and restrictions. Please always inform restaurant staff of your specific allergies or health restrictions, and verify ingredients, cooking oils, and cross-contamination surfaces before ordering. U Map provides dietary guidance, not medical diagnosis or treatment."
            );
        }
    }

    // 3. Budget Box
    const targetVal = document.getElementById("budgetTargetVal");
    const avgVal = document.getElementById("budgetAvgVal");
    const verdictBadge = document.getElementById("budgetVerdictBadge");

    if (targetVal) targetVal.textContent = `₹${data.budget} / day`;
    if (avgVal && data.budget_analysis) {
        avgVal.textContent = `Estimated Daily Average: ${data.budget_analysis.estimated_daily_average || '₹' + Math.round(data.budget * 0.95)}`;
    }
    if (verdictBadge && data.budget_analysis) {
        verdictBadge.textContent = data.budget_analysis.budget_verdict || "Estimated within target";
    }

    // 4. Render Top Foods to Try
    const topFoodsGrid = document.getElementById("topFoodsGrid");
    const topHeading = document.getElementById("topFoodsHeading");
    const topSub = document.getElementById("topFoodsSub");

    if (topHeading) topHeading.textContent = `🌟 Top Foods to Try in ${data.location}`;
    if (topSub) {
        topSub.textContent = `Curated for ${data.food_preference} · ${data.dietary_preference}${hasRestriction ? ' · ' + data.health_restriction : ''} within your ₹${data.budget}/day budget.`;
    }

    if (topFoodsGrid) {
        topFoodsGrid.innerHTML = "";
        const foods = data.top_foods || [];
        foods.forEach(food => {
            const card = document.createElement("div");
            card.className = "top-food-card";

            const tagsHtml = (food.diet_tags || [data.food_preference]).map(tag => 
                `<span class="food-tag">${escapeHtml(tag)}</span>`
            ).join("");

            card.innerHTML = `
                <div class="card-header-row">
                    <h4 class="food-dish-name">${escapeHtml(food.name)}</h4>
                    <span class="food-category-pill">${escapeHtml(food.category || "Local Specialty")}</span>
                </div>
                <div class="food-tags-row">${tagsHtml}</div>
                <p class="food-description">${escapeHtml(food.description || "")}</p>
                <div class="food-why-fits">
                    <span class="why-icon">💡</span>
                    <span><strong>Why it fits:</strong> ${escapeHtml(food.why_fits || "Matches your dietary preference.")}</span>
                </div>
                <div class="food-card-footer">
                    <div class="price-badge-wrap">
                        <span class="price-badge">${escapeHtml(food.estimated_price || "Estimated: Reasonable")}</span>
                        <span class="price-note-mini">*Estimated price</span>
                    </div>
                    ${food.recommended_venue_types ? `
                        <div class="venue-hint">
                            <span class="venue-icon">🏬</span> ${escapeHtml(food.recommended_venue_types)}
                        </div>
                    ` : ""}
                </div>
            `;
            topFoodsGrid.appendChild(card);
        });
    }

    // 5. Render Week-Long / Multi-Day Meal Plan
    const mealHeading = document.getElementById("mealPlanHeading");
    const mealSub = document.getElementById("mealPlanSub");
    const tabsContainer = document.getElementById("daySelectorTabs");
    const daysContainer = document.getElementById("mealPlanDaysContainer");

    if (mealHeading) mealHeading.textContent = `📅 ${data.duration}-Day Food Itinerary for ${data.location}`;
    if (mealSub) {
        mealSub.textContent = `Every day includes Breakfast, Lunch, Dinner, and an Optional Snack — fully respecting ${data.food_preference} & ${data.health_restriction} without repeating dishes.`;
    }

    const plans = data.meal_plan || [];

    // Render day selector tabs
    if (tabsContainer) {
        tabsContainer.innerHTML = "";
        
        // "Show All Days" button
        const allBtn = document.createElement("button");
        allBtn.type = "button";
        allBtn.className = "day-tab active";
        allBtn.textContent = `View All (${plans.length} Days)`;
        allBtn.onclick = () => switchFoodDay("all", allBtn);
        tabsContainer.appendChild(allBtn);

        plans.forEach(plan => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "day-tab";
            btn.textContent = `Day ${plan.day}`;
            btn.onclick = () => switchFoodDay(plan.day, btn);
            tabsContainer.appendChild(btn);
        });
    }

    // Render day cards
    if (daysContainer) {
        daysContainer.innerHTML = "";
        plans.forEach(plan => {
            const dayCard = document.createElement("div");
            dayCard.className = "meal-day-card";
            dayCard.id = `foodPlanDay_${plan.day}`;

            dayCard.innerHTML = `
                <div class="day-card-header">
                    <div class="day-title-wrap">
                        <span class="day-number-badge">Day ${plan.day}</span>
                        <h4 class="day-theme-title">${escapeHtml(plan.theme || `Day ${plan.day} Exploration`)}</h4>
                    </div>
                    <div class="day-cost-estimate">
                        <span class="cost-label">Estimated Day Total:</span>
                        <span class="cost-val">${escapeHtml(plan.estimated_day_total || `~₹${data.budget}`)}</span>
                    </div>
                </div>

                <div class="meal-slots-grid">
                    <!-- Breakfast -->
                    <div class="meal-slot-item breakfast-slot">
                        <div class="slot-badge">🍳 Breakfast</div>
                        <h5 class="meal-dish-name">${escapeHtml(plan.breakfast?.dish || "Nutritious Morning Meal")}</h5>
                        <p class="meal-dish-desc">${escapeHtml(plan.breakfast?.description || "")}</p>
                        <div class="meal-price-tag">${escapeHtml(plan.breakfast?.estimated_price || "Estimated: ₹80 - ₹120")}</div>
                    </div>

                    <!-- Lunch -->
                    <div class="meal-slot-item lunch-slot">
                        <div class="slot-badge">🍲 Lunch</div>
                        <h5 class="meal-dish-name">${escapeHtml(plan.lunch?.dish || "Balanced Midday Feast")}</h5>
                        <p class="meal-dish-desc">${escapeHtml(plan.lunch?.description || "")}</p>
                        <div class="meal-price-tag">${escapeHtml(plan.lunch?.estimated_price || "Estimated: ₹150 - ₹220")}</div>
                    </div>

                    <!-- Dinner -->
                    <div class="meal-slot-item dinner-slot">
                        <div class="slot-badge">🍽️ Dinner</div>
                        <h5 class="meal-dish-name">${escapeHtml(plan.dinner?.dish || "Evening Specialty")}</h5>
                        <p class="meal-dish-desc">${escapeHtml(plan.dinner?.description || "")}</p>
                        <div class="meal-price-tag">${escapeHtml(plan.dinner?.estimated_price || "Estimated: ₹180 - ₹260")}</div>
                    </div>

                    <!-- Optional Snack -->
                    <div class="meal-slot-item snack-slot">
                        <div class="slot-badge">☕ Optional Snack</div>
                        <h5 class="meal-dish-name">${escapeHtml(plan.optional_snack?.dish || "Local Refreshment")}</h5>
                        <p class="meal-dish-desc">${escapeHtml(plan.optional_snack?.description || "")}</p>
                        <div class="meal-price-tag">${escapeHtml(plan.optional_snack?.estimated_price || "Estimated: ₹40 - ₹80")}</div>
                    </div>
                </div>
            `;
            daysContainer.appendChild(dayCard);
        });
    }
}

function switchFoodDay(day, tabBtn) {
    currentActiveFoodDay = day;

    // Update active tab class
    const tabs = document.querySelectorAll(".day-selector-pills .day-tab");
    tabs.forEach(t => t.classList.remove("active"));
    if (tabBtn) tabBtn.classList.add("active");

    // Filter day cards
    const dayCards = document.querySelectorAll(".meal-day-card");
    dayCards.forEach(card => {
        if (day === "all") {
            card.style.display = "block";
        } else {
            card.style.display = card.id === `foodPlanDay_${day}` ? "block" : "none";
        }
    });
}

function copyFoodPlan() {
    if (!currentFoodPlanData) return;
    const d = currentFoodPlanData;
    let txt = `=========================================\n`;
    txt += `U Map FOOD THAT FITS YOU - ${d.location.toUpperCase()}\n`;
    txt += `Preferences: ${d.food_preference} | ${d.dietary_preference}\n`;
    txt += `Health Restriction: ${d.health_restriction}\n`;
    txt += `Budget: ₹${d.budget}/day | Duration: ${d.duration} Days\n`;
    txt += `=========================================\n\n`;

    txt += `TOP FOODS TO TRY:\n`;
    (d.top_foods || []).forEach((f, i) => {
        txt += `${i+1}. ${f.name} (${f.estimated_price})\n   ${f.description}\n   Why it fits: ${f.why_fits}\n\n`;
    });

    txt += `-----------------------------------------\n`;
    txt += `${d.duration}-DAY MEAL PLAN:\n`;
    txt += `-----------------------------------------\n`;
    (d.meal_plan || []).forEach(p => {
        txt += `\nDAY ${p.day} (${p.theme || ''}) - ${p.estimated_day_total || ''}\n`;
        txt += `  🍳 Breakfast: ${p.breakfast?.dish || ''} (${p.breakfast?.estimated_price || ''})\n`;
        txt += `  🍲 Lunch: ${p.lunch?.dish || ''} (${p.lunch?.estimated_price || ''})\n`;
        txt += `  🍽️ Dinner: ${p.dinner?.dish || ''} (${p.dinner?.estimated_price || ''})\n`;
        txt += `  ☕ Snack: ${p.optional_snack?.dish || ''} (${p.optional_snack?.estimated_price || ''})\n`;
    });

    txt += `\n* Note: All prices are estimated ranges. Verify ingredients with restaurants.\n`;

    navigator.clipboard.writeText(txt).then(() => {
        const btn = document.querySelector(".food-copy-btn");
        if (btn) {
            const old = btn.textContent;
            btn.textContent = "✅ Copied!";
            setTimeout(() => { btn.textContent = old; }, 2000);
        }
    }).catch(err => {
        alert("Plan copied to clipboard!");
    });
}

function printFoodPlan() {
    // Show all day cards so complete multi-day plan prints
    const dayCards = document.querySelectorAll(".meal-day-card");
    dayCards.forEach(card => {
        card.style.display = "block";
    });

    document.body.classList.add("printing-food-plan");
    window.print();
}
window.printFoodPlan = printFoodPlan;

// Print lifecycle handlers to guarantee full multi-day food plan prints
window.addEventListener("beforeprint", () => {
    document.body.classList.add("printing-food-plan");
    const dayCards = document.querySelectorAll(".meal-day-card");
    dayCards.forEach(card => {
        card.style.display = "block";
    });
});

window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-food-plan");
    if (typeof currentActiveFoodDay !== "undefined" && currentActiveFoodDay !== "all") {
        const dayCards = document.querySelectorAll(".meal-day-card");
        dayCards.forEach(card => {
            card.style.display = card.id === `foodPlanDay_${currentActiveFoodDay}` ? "block" : "none";
        });
    }
});

// Backwards compatibility alias
function searchFood() {
    generateFoodPlan();
}



function searchFoodNearMe() {

    const query =
        document.getElementById(
            "mainQuery"
        );


    if (query) {
        query.value =
            "restaurants";
    }


    if (currentLocation) {

        performSearch();

    } else {

        useCurrentLocation(
            true
        );
    }
}


/* =========================================================
   ROUTES
   ========================================================= */

async function getDirections() {

    const start =
        document.getElementById(
            "routeStart"
        )?.value.trim();


    const end =
        document.getElementById(
            "routeEnd"
        )?.value.trim();


    const output =
        document.getElementById(
            "routeResults"
        );


    if (
        !start ||
        !end
    ) {

        if (output) {

            output.innerHTML = `
                <div class="empty-state">
                    <h3>
                        Enter both locations
                    </h3>
                    <p>
                        Please enter a starting point
                        and destination.
                    </p>
                </div>
            `;
        }

        return;
    }


    if (output) {

        output.innerHTML = `
            <div class="empty-state">
                <div>🗺️</div>
                <h3>
                    Comparing routes...
                </h3>
                <p>
                    Calculating real routes and transport modes...
                </p>
            </div>
        `;
    }


    try {

        const response =
            await fetch(
                `/api/directions?start=${encodeURIComponent(
                    start
                )}&end=${encodeURIComponent(
                    end
                )}`,
                {
                    headers: {
                        "Accept": "application/json"
                    }
                }
            );

        const data =
            await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error ||
                "Failed to calculate directions. Please check the locations."
            );
        }

        const comparison =
            data.comparison || [];

        const routes =
            data.routes || [];

        let html = `
            <div class="route-comparison-card" style="margin-top:20px; padding:20px; background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; box-shadow:0 4px 16px rgba(0,0,0,0.04);">
                <div style="margin-bottom:16px;">
                    <span style="font-size:12px; font-weight:700; color:#6366f1; text-transform:uppercase; letter-spacing:0.5px;">Route Comparison</span>
                    <h3 style="margin:4px 0 2px; font-size:18px;">${escapeHtml(data.start || start)} → ${escapeHtml(data.end || end)}</h3>
                    <p style="font-size:13px; color:#6b7280; margin:0;">Comparison of transport modes based on real route and geocoding data</p>
                </div>
                <div class="comparison-table-wrapper">
                    <table class="transport-table">
                        <thead>
                            <tr>
                                <th>Mode</th>
                                <th>Distance</th>
                                <th>Duration</th>
                                <th>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${comparison.map(item => `
                                <tr>
                                    <td><strong>${escapeHtml(item.mode)}</strong></td>
                                    <td>${escapeHtml(item.distance || "Data unavailable")}</td>
                                    <td>${escapeHtml(item.duration || "Data unavailable")}</td>
                                    <td><small style="color:#6b7280;">${escapeHtml(item.notes || "—")}</small></td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        if (routes.length) {
            html += `
                <div style="margin-top:20px;">
                    <h4 style="margin-bottom:12px; font-size:15px; font-weight:700;">Road Route Details</h4>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
                        ${routes.map(route => `
                            <div class="route-card" style="padding:14px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px;">
                                <h4 style="margin:0 0 6px 0; font-size:14px;">${escapeHtml(route.title || "Route")}</h4>
                                <p style="margin:4px 0; font-size:13px;"><strong>Distance:</strong> ${escapeHtml(route.formatted_distance || route.distance || "—")}</p>
                                <p style="margin:4px 0; font-size:13px;"><strong>Duration:</strong> ${escapeHtml(route.formatted_duration || route.duration || "—")}</p>
                                <p style="margin:4px 0; font-size:12px; color:#6b7280;">${escapeHtml(route.price || "Taxi fare unavailable from the configured API")}</p>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        }

        output.innerHTML = html;

    } catch (error) {

        if (output) {

            output.innerHTML = `
                <div class="empty-state" style="padding:24px; text-align:center;">
                    <div style="font-size:28px; margin-bottom:8px;">⚠️</div>
                    <h3 style="margin-bottom:6px;">
                        Route Comparison Notice
                    </h3>
                    <p style="color:#dc2626; margin:0;">
                        ${escapeHtml(
                            error.message
                        )}
                    </p>
                </div>
            `;
        }
    }
}


/* =========================================================
   SMART JOURNEY PLANNER
   Real-Time Multimodal Routing & Intelligent Selection
   ========================================================= */

let activeJourneyData = null;
let journeyMapLayerGroup = null;
let journeyRoutePolyline = null;

function formatSmartJourneyDuration(minutes) {
    const total = Number(minutes);
    if (!Number.isFinite(total) || total <= 0) return "—";
    const hours = Math.floor(total / 60);
    const mins = Math.round(total % 60);
    if (hours <= 0) return `${mins} min`;
    if (mins === 0) return `${hours} hr`;
    return `${hours} hr ${mins} min`;
}

function showSmartJourneyError(message) {
    const errorBox = document.getElementById("smartJourneyError");
    const errorMsg = document.getElementById("smartJourneyErrorMessage");
    const resultsBox = document.getElementById("smartJourneyResults");
    const loadingBox = document.getElementById("smartJourneyLoading");

    if (loadingBox) loadingBox.style.display = "none";
    if (resultsBox) resultsBox.style.display = "none";

    if (errorBox) {
        errorBox.style.display = "block";
        if (errorMsg) {
            errorMsg.textContent = message || "Unable to calculate routes for these locations.";
        }
    }
}

function toggleStopsDrawer(btn) {
    const drawer = btn.nextElementSibling;
    if (!drawer) return;
    const isOpen = drawer.classList.contains("open");
    if (isOpen) {
        drawer.classList.remove("open");
        const count = btn.getAttribute("data-count") || "";
        btn.innerHTML = `<span>Stops / Stations (${count})</span> <span>▼</span>`;
    } else {
        drawer.classList.add("open");
        const count = btn.getAttribute("data-count") || "";
        btn.innerHTML = `<span>Hide Stops (${count})</span> <span>▲</span>`;
    }
}

function renderJourneyOnMap(routeData, modeOption) {
    if (typeof map === "undefined" || !map) {
        console.warn("Leaflet map is not initialized yet.");
        return;
    }

    try {
        // Clear previous journey layers
        if (journeyRoutePolyline) {
            map.removeLayer(journeyRoutePolyline);
            journeyRoutePolyline = null;
        }
        if (journeyMapLayerGroup) {
            map.removeLayer(journeyMapLayerGroup);
            journeyMapLayerGroup = null;
        }

        journeyMapLayerGroup = L.layerGroup().addTo(map);

        const startCoord = routeData.start_coordinates;
        const endCoord = routeData.end_coordinates;
        const waypoints = (modeOption && modeOption.waypoints) || [];

        const latlngs = [];

        // Start marker
        if (startCoord && startCoord.latitude && startCoord.longitude) {
            const startLL = [Number(startCoord.latitude), Number(startCoord.longitude)];
            latlngs.push(startLL);

            const startMarkerHtml = `
                <div style="background:#5b5cf0; color:#fff; width:34px; height:34px; border-radius:50%; display:grid; place-items:center; font-size:16px; box-shadow:0 4px 14px rgba(91,92,240,0.4); border:2px solid #fff;">
                    📍
                </div>
            `;
            const startIcon = L.divIcon({
                className: "umap-custom-marker",
                html: startMarkerHtml,
                iconSize: [34, 34],
                iconAnchor: [17, 34]
            });

            L.marker(startLL, { icon: startIcon })
                .bindPopup(`<strong>Origin:</strong> ${escapeHtml(routeData.from || "Start")}`)
                .addTo(journeyMapLayerGroup);
        }

        // Waypoints/intermediate stops
        waypoints.slice(0, 8).forEach(wp => {
            if (wp.latitude && wp.longitude) {
                const wpLL = [Number(wp.latitude), Number(wp.longitude)];
                latlngs.push(wpLL);

                const stopMarkerHtml = `
                    <div style="background:#06b6d4; color:#fff; width:22px; height:22px; border-radius:50%; display:grid; place-items:center; font-size:11px; box-shadow:0 2px 8px rgba(6,182,212,0.4); border:2px solid #fff;">
                        •
                    </div>
                `;
                const stopIcon = L.divIcon({
                    className: "umap-custom-marker-stop",
                    html: stopMarkerHtml,
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                });

                L.marker(wpLL, { icon: stopIcon })
                    .bindPopup(`<strong>Stop / Station:</strong> ${escapeHtml(wp.name || "Transit Stop")}`)
                    .addTo(journeyMapLayerGroup);
            }
        });

        // Destination marker
        if (endCoord && endCoord.latitude && endCoord.longitude) {
            const endLL = [Number(endCoord.latitude), Number(endCoord.longitude)];
            latlngs.push(endLL);

            const endMarkerHtml = `
                <div style="background:#ec4899; color:#fff; width:34px; height:34px; border-radius:50%; display:grid; place-items:center; font-size:16px; box-shadow:0 4px 14px rgba(236,72,153,0.4); border:2px solid #fff;">
                    🏁
                </div>
            `;
            const endIcon = L.divIcon({
                className: "umap-custom-marker-end",
                html: endMarkerHtml,
                iconSize: [34, 34],
                iconAnchor: [17, 34]
            });

            L.marker(endLL, { icon: endIcon })
                .bindPopup(`<strong>Destination:</strong> ${escapeHtml(routeData.to || "Destination")}`)
                .addTo(journeyMapLayerGroup);
        }

        if (latlngs.length >= 2) {
            const isWalk = modeOption && modeOption.mode === "walking";
            journeyRoutePolyline = L.polyline(latlngs, {
                color: "#5b5cf0",
                weight: 5,
                opacity: 0.88,
                dashArray: isWalk ? "6, 8" : null,
                lineJoin: "round"
            }).addTo(map);

            map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 15 });
        } else if (latlngs.length === 1) {
            map.setView(latlngs[0], 13);
        }
    } catch (err) {
        console.error("Map route plotting error:", err);
    }
}

function focusRouteOnMap(modeId) {
    if (!activeJourneyData) return;
    const option = activeJourneyData.options.find(o => o.id === modeId) || activeJourneyData.smart_route;
    renderJourneyOnMap(activeJourneyData, option);

    const mapElement = document.getElementById("map");
    if (mapElement) {
        mapElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function renderSmartJourneyResults(data) {
    activeJourneyData = data;

    const resultsBox = document.getElementById("smartJourneyResults");
    const errorBox = document.getElementById("smartJourneyError");
    const loadingBox = document.getElementById("smartJourneyLoading");

    if (loadingBox) loadingBox.style.display = "none";
    if (errorBox) errorBox.style.display = "none";

    if (!resultsBox) return;
    resultsBox.style.display = "block";

    // 1. RENDER U Map SMART ROUTE
    const smart = data.smart_route;
    const smartRouteCard = document.getElementById("smartRouteCard");
    const criteriaBadge = document.getElementById("smartRouteCriteriaBadge");

    if (criteriaBadge) {
        criteriaBadge.textContent = smart.badge || "⚡ Recommended Route";
    }

    if (smartRouteCard) {
        // Build path nodes
        const pathItems = (smart.path_display || "").split(" → ");
        let breadcrumbsHtml = "";
        pathItems.forEach((item, idx) => {
            breadcrumbsHtml += `<span class="path-node">${escapeHtml(item.trim())}</span>`;
            if (idx < pathItems.length - 1) {
                breadcrumbsHtml += `<span class="path-arrow">→</span>`;
            }
        });

        // Stops preview if available
        let stopsHtml = "";
        if (smart.stops && smart.stops.length > 0) {
            stopsHtml = `
                <div style="margin-top:14px;">
                    <button type="button" class="stops-toggle-btn" data-count="${smart.stops.length}" onclick="toggleStopsDrawer(this)">
                        <span>Stops / Stations (${smart.stops.length})</span> <span>▼</span>
                    </button>
                    <div class="card-stops-drawer">
                        <ol>
                            ${smart.stops.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
                        </ol>
                    </div>
                </div>
            `;
        }

        smartRouteCard.innerHTML = `
            <div class="smart-route-hero">
                <div class="smart-route-mode-info">
                    <div class="smart-route-icon-box">
                        ${escapeHtml(smart.icon || "✦")}
                    </div>
                    <div class="smart-route-titles">
                        <h3>${escapeHtml(smart.mode_label || "Smart Route")}</h3>
                        <span>${escapeHtml(smart.route || "Optimal multimodal connection")}</span>
                    </div>
                </div>

                <div class="smart-route-stats-row">
                    <div class="smart-route-stat highlight">
                        <small>Travel Time</small>
                        <strong>${escapeHtml(smart.duration)}</strong>
                    </div>
                    <div class="smart-route-stat">
                        <small>Distance</small>
                        <strong>${escapeHtml(smart.distance)}</strong>
                    </div>
                    <div class="smart-route-stat">
                        <small>Transfers</small>
                        <strong style="font-size:18px; margin-top:4px;">${escapeHtml(smart.transfers_label || "Direct")}</strong>
                    </div>
                </div>
            </div>

            <div class="smart-route-reason-box">
                <span class="smart-route-reason-icon">💡</span>
                <div>
                    <strong>Why this route?</strong> ${escapeHtml(smart.reason)}
                </div>
            </div>

            <div class="smart-route-path-box">
                <div class="path-box-label">Verified Route Sequence</div>
                <div class="path-breadcrumbs">
                    ${breadcrumbsHtml}
                </div>
                ${stopsHtml}
            </div>

            <div class="smart-route-footer">
                <div class="smart-route-transfers-info">
                    <span class="transfers-pill ${smart.transfers > 0 ? 'has-transfers' : ''}">
                        ${smart.transfers === 0 ? '✓ Direct Route' : `🔄 ${smart.transfers} Transfer${smart.transfers > 1 ? 's' : ''}`}
                    </span>
                    <span>• Real-world Google Maps navigation data</span>
                </div>
                <button type="button" class="view-on-map-btn" onclick="focusRouteOnMap('${smart.id}')">
                    <span>🗺️ View on Map</span>
                </button>
            </div>
        `;
    }

    // 2. RENDER ALL TRAVEL OPTIONS
    const optionsGrid = document.getElementById("travelOptionsGrid");
    const countBadge = document.getElementById("optionsCountBadge");

    if (countBadge) {
        countBadge.textContent = `${data.options.length} Options Available`;
    }

    if (optionsGrid) {
        let gridHtml = "";

        data.options.forEach(opt => {
            const isSmartRoute = (opt.id === smart.id);

            // Badge tags
            let tagBadge = "";
            if (isSmartRoute) {
                tagBadge = `<span style="font-size:11px; font-weight:800; background:rgba(91,92,240,0.14); color:#5b5cf0; border:1px solid rgba(91,92,240,0.3); padding:3px 8px; border-radius:999px;">★ SMART CHOICE</span>`;
            } else if (opt.is_fastest) {
                tagBadge = `<span style="font-size:11px; font-weight:800; background:rgba(16,185,129,0.14); color:#10b981; border:1px solid rgba(16,185,129,0.3); padding:3px 8px; border-radius:999px;">⚡ FASTEST</span>`;
            } else if (opt.is_shortest) {
                tagBadge = `<span style="font-size:11px; font-weight:800; background:rgba(6,182,212,0.14); color:#06b6d4; border:1px solid rgba(6,182,212,0.3); padding:3px 8px; border-radius:999px;">📍 SHORTEST</span>`;
            }

            // Stops list if any
            let stopsSection = "";
            if (opt.stops && opt.stops.length > 0) {
                stopsSection = `
                    <div class="card-stops-section">
                        <button type="button" class="stops-toggle-btn" data-count="${opt.stops.length}" onclick="toggleStopsDrawer(this)">
                            <span>Stops / Stations (${opt.stops.length})</span> <span>▼</span>
                        </button>
                        <div class="card-stops-drawer">
                            <ol>
                                ${opt.stops.map(s => `<li>${escapeHtml(s)}</li>`).join("")}
                            </ol>
                        </div>
                    </div>
                `;
            }

            gridHtml += `
                <div class="travel-card ${isSmartRoute ? 'is-smart-route' : ''}" id="card-${opt.id}">
                    <div>
                        <div class="card-top-row">
                            <div class="card-mode-header">
                                <div class="card-mode-icon">
                                    ${escapeHtml(opt.icon || "•")}
                                </div>
                                <div>
                                    <h4>${escapeHtml(opt.mode_label)}</h4>
                                    <small style="color:var(--muted); font-size:12px;">${escapeHtml(opt.route || "Direct route")}</small>
                                </div>
                            </div>
                            <div class="card-badge-row">
                                ${tagBadge}
                                <span class="transfers-pill ${opt.transfers > 0 ? 'has-transfers' : ''}" style="font-size:11px; padding:2px 8px;">
                                    ${escapeHtml(opt.transfers_label || "Direct")}
                                </span>
                            </div>
                        </div>

                        <div class="card-stat-strip">
                            <div>
                                <small style="display:block; font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase;">Duration</small>
                                <span class="duration">${escapeHtml(opt.duration)}</span>
                            </div>
                            <div style="text-align:right;">
                                <small style="display:block; font-size:11px; color:var(--muted); font-weight:700; text-transform:uppercase;">Distance</small>
                                <span class="distance">${escapeHtml(opt.distance)}</span>
                            </div>
                        </div>

                        <div class="card-path-details">
                            <div class="card-path-label">Route Breadcrumbs</div>
                            <div class="card-path-text">${escapeHtml(opt.path_display || `${data.from} → ${data.to}`)}</div>
                        </div>

                        ${stopsSection}
                    </div>

                    <div class="card-footer-row">
                        <span style="font-size:12px; color:var(--muted);">
                            ${opt.transfers === 0 ? '✓ No transfers' : `${opt.transfers} transfer`}
                        </span>
                        <button type="button" class="view-on-map-btn" onclick="focusRouteOnMap('${opt.id}')">
                            <span>🗺️ View on Map</span>
                        </button>
                    </div>
                </div>
            `;
        });

        optionsGrid.innerHTML = gridHtml;
    }

    // Automatically plot the Smart Route on Leaflet map
    renderJourneyOnMap(data, smart);

    // Smooth scroll to results
    resultsBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function searchSmartJourney() {
    const fromInput = document.getElementById("smartJourneyFrom");
    const toInput = document.getElementById("smartJourneyTo");
    const fromDateInput = document.getElementById("smartJourneyFromDate");
    const toDateInput = document.getElementById("smartJourneyToDate");

    const fromVal = fromInput ? fromInput.value.trim() : "";
    const toVal = toInput ? toInput.value.trim() : "";
    const fromDateVal = fromDateInput ? fromDateInput.value.trim() : "";
    const toDateVal = toDateInput ? toDateInput.value.trim() : "";

    const loadingBox = document.getElementById("smartJourneyLoading");
    const errorBox = document.getElementById("smartJourneyError");
    const resultsBox = document.getElementById("smartJourneyResults");
    const searchBtn = document.getElementById("smartJourneySearchBtn");
    const spinner = document.getElementById("smartJourneyBtnSpinner");
    const btnText = document.getElementById("smartJourneyBtnText");

    if (!fromVal || !toVal) {
        showSmartJourneyError("Please enter both a starting location and destination.");
        if (!fromVal && fromInput) fromInput.focus();
        else if (toInput) toInput.focus();
        return;
    }

    if (errorBox) errorBox.style.display = "none";
    if (resultsBox) resultsBox.style.display = "none";
    if (loadingBox) loadingBox.style.display = "block";

    if (searchBtn) searchBtn.disabled = true;
    if (spinner) spinner.style.display = "inline-block";
    if (btnText) btnText.textContent = "Calculating...";

    try {
        const response = await fetch("/api/smart-journey", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                from: fromVal,
                to: toVal,
                date: fromDateVal,
                from_date: fromDateVal,
                to_date: toDateVal
            })
        });

        // Safely parse JSON — guard against HTML error pages
        let data;
        try {
            data = await response.json();
        } catch (_parseErr) {
            throw new Error(
                `Server returned an unexpected response (HTTP ${response.status}). ` +
                "Please make sure the server is running and try again."
            );
        }

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Unable to calculate smart journey for these locations.");
        }

        renderSmartJourneyResults(data);

    } catch (err) {
        console.error("Smart journey planning error:", err);
        showSmartJourneyError(err.message || "Unable to calculate journey. Please check the locations and try again.");
    } finally {
        if (loadingBox) loadingBox.style.display = "none";
        if (searchBtn) searchBtn.disabled = false;
        if (spinner) spinner.style.display = "none";
        if (btnText) btnText.textContent = "Search Journey";
    }
}

function setupJourneyPlanner() {
    console.log("Setting up U Map Smart Journey Planner...");

    // Set default dates if empty (From Date = today, To Date = tomorrow)
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    const fromDateInput = document.getElementById("smartJourneyFromDate");
    if (fromDateInput && !fromDateInput.value) {
        fromDateInput.value = today;
        fromDateInput.min = today;
    }

    const toDateInput = document.getElementById("smartJourneyToDate");
    if (toDateInput && !toDateInput.value) {
        toDateInput.value = tomorrow;
        toDateInput.min = today;
    }

    // Keep To Date >= From Date whenever From Date changes
    if (fromDateInput && toDateInput) {
        fromDateInput.addEventListener("change", () => {
            if (toDateInput.value && toDateInput.value < fromDateInput.value) {
                toDateInput.value = fromDateInput.value;
            }
            toDateInput.min = fromDateInput.value;
        });
    }

    // Swap button
    const swapBtn = document.getElementById("smartJourneySwapBtn");
    if (swapBtn) {
        swapBtn.addEventListener("click", () => {
            const fromInput = document.getElementById("smartJourneyFrom");
            const toInput = document.getElementById("smartJourneyTo");
            if (fromInput && toInput) {
                const tmp = fromInput.value;
                fromInput.value = toInput.value;
                toInput.value = tmp;
            }
        });
    }

    // Search button
    const searchBtn = document.getElementById("smartJourneySearchBtn");
    if (searchBtn) {
        searchBtn.addEventListener("click", (e) => {
            e.preventDefault();
            searchSmartJourney();
        });
    }

    // Enter key handling on input fields
    ["smartJourneyFrom", "smartJourneyTo", "smartJourneyFromDate", "smartJourneyToDate"].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    searchSmartJourney();
                }
            });
        }
    });

    // Make global for inline handlers
    window.searchSmartJourney = searchSmartJourney;
    window.toggleStopsDrawer = toggleStopsDrawer;
    window.focusRouteOnMap = focusRouteOnMap;
}


/* =========================================================
   AI LOCAL GUIDE
   ========================================================= */

async function askAI() {

    const input =
        document.getElementById(
            "aiMessage"
        );


    const responseBox =
        document.getElementById(
            "aiResponse"
        );


    const loading =
        document.getElementById(
            "aiLoading"
        );


    const button =
        document.getElementById(
            "askAIButton"
        );


    const message =
        input?.value.trim();


    if (!message) {

        if (responseBox) {
            responseBox.textContent =
                "Please enter a question.";
        }

        return;
    }


    if (loading) {
        loading.style.display =
            "block";
    }


    if (button) {
        button.disabled =
            true;
    }


    if (responseBox) {
        responseBox.textContent =
            "";
    }


    try {

        const data =
            await fetchJson(
                "/api/ai-chat",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            message: message
                        })
                }
            );


        const answer =
            data.response ||
            data.text ||
            data.message ||
            "U Map could not generate a response.";


        if (responseBox) {
            responseBox.textContent =
                answer;
        }


    } catch (error) {

        if (responseBox) {

            responseBox.textContent =
                `AI error: ${error.message}`;
        }

    } finally {

        if (loading) {
            loading.style.display =
                "none";
        }


        if (button) {
            button.disabled =
                false;
        }
    }
}


/* =========================================================
   REVIEWS
   ========================================================= */

function createReviewModal() {

    let modal =
        document.getElementById(
            "naviReviewModal"
        );


    if (modal) {
        return modal;
    }


    modal =
        document.createElement(
            "div"
        );


    modal.id =
        "naviReviewModal";


    modal.innerHTML = `
        <div
            style="
                position:fixed;
                inset:0;
                background:rgba(0,0,0,.6);
                z-index:99999;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:20px;
            "
            data-review-close="true"
        >

            <div
                style="
                    width:min(760px,100%);
                    max-height:85vh;
                    overflow:auto;
                    background:white;
                    border-radius:18px;
                    padding:24px;
                    box-shadow:0 20px 60px rgba(0,0,0,.25);
                "
            >

                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:20px;
                        margin-bottom:20px;
                    "
                >

                    <div>

                        <h2
                            id="reviewModalTitle"
                            style="margin:0;"
                        >
                            Reviews
                        </h2>

                        <p
                            id="reviewModalMeta"
                            style="margin:5px 0 0;color:#777;"
                        ></p>

                    </div>


                    <button
                        type="button"
                        id="reviewModalClose"
                        style="
                            border:0;
                            background:#eee;
                            width:38px;
                            height:38px;
                            border-radius:50%;
                            font-size:20px;
                            cursor:pointer;
                        "
                    >
                        ×
                    </button>

                </div>


                <div
                    id="reviewModalBody"
                >
                    Loading reviews...
                </div>

            </div>

        </div>
    `;


    document.body.appendChild(
        modal
    );


    modal
        .querySelector(
            "#reviewModalClose"
        )
        .addEventListener(
            "click",
            closeReviewModal
        );


    modal.addEventListener(
        "click",
        event => {

            if (
                event.target.dataset.reviewClose ===
                "true"
            ) {

                closeReviewModal();
            }
        }
    );


    return modal;
}


function closeReviewModal() {

    const modal =
        document.getElementById(
            "naviReviewModal"
        );


    if (modal) {
        modal.remove();
    }
}


async function loadReviews(
    dataId,
    placeId = "",
    query = ""
) {

    if (!dataId && !placeId && !query) {
        return;
    }


    const modal =
        createReviewModal();


    const title =
        modal.querySelector(
            "#reviewModalTitle"
        );


    const meta =
        modal.querySelector(
            "#reviewModalMeta"
        );


    const body =
        modal.querySelector(
            "#reviewModalBody"
        );


    if (body) {

        body.innerHTML = `
            <div style="
                padding:30px;
                text-align:center;
            ">
                Loading real reviews...
            </div>
        `;
    }


    try {

        let revUrl = `/api/reviews?`;
        if (dataId) {
            revUrl += `data_id=${encodeURIComponent(dataId)}`;
        } else if (placeId) {
            revUrl += `place_id=${encodeURIComponent(placeId)}`;
        } else {
            revUrl += `q=${encodeURIComponent(query)}`;
        }

        const data =
            await fetchJson(
                revUrl
            );


        const place =
            data.place || {};


        if (title) {

            title.textContent =
                place.title ||
                "Reviews";
        }


        if (meta) {

            meta.textContent =
                place.rating
                    ? `⭐ ${place.rating} • ${place.review_count || 0} reviews`
                    : "";
        }


        const reviews =
            data.reviews || [];


        if (!reviews.length) {

            body.innerHTML = `
                <div
                    style="
                        padding:30px;
                        text-align:center;
                        color:#666;
                    "
                >
                    No reviews were returned.
                </div>
            `;

            return;
        }


        body.innerHTML =
            reviews.map(
                review => {

                    const name =
                        review.name ||
                        "Google user";


                    const photo =
                        safeUrl(
                            review.photo
                        );


                    const rating =
                        review.rating ??
                        "—";


                    const date =
                        review.date ||
                        "";


                    const text =
                        review.text ||
                        "No review text available.";


                    return `
                        <article
                            style="
                                border:1px solid #e7e7e7;
                                border-radius:14px;
                                padding:16px;
                                margin-bottom:12px;
                            "
                        >

                            <div
                                style="
                                    display:flex;
                                    align-items:center;
                                    gap:12px;
                                "
                            >

                                ${
                                    photo !== "#"
                                        ? `
                                            <img
                                                src="${photo}"
                                                alt=""
                                                style="
                                                    width:42px;
                                                    height:42px;
                                                    border-radius:50%;
                                                    object-fit:cover;
                                                "
                                            >
                                        `
                                        : `
                                            <div
                                                style="
                                                    width:42px;
                                                    height:42px;
                                                    border-radius:50%;
                                                    background:#eee;
                                                    display:flex;
                                                    align-items:center;
                                                    justify-content:center;
                                                "
                                            >
                                                👤
                                            </div>
                                        `
                                }


                                <div>

                                    <strong>
                                        ${escapeHtml(name)}
                                    </strong>

                                    <div
                                        style="
                                            color:#777;
                                            font-size:13px;
                                        "
                                    >
                                        ⭐ ${escapeHtml(rating)}
                                        ${date
                                            ? ` • ${escapeHtml(date)}`
                                            : ""
                                        }
                                    </div>

                                </div>

                            </div>


                            <p
                                style="
                                    line-height:1.6;
                                    margin:14px 0 0;
                                "
                            >
                                ${escapeHtml(text)}
                            </p>

                        </article>
                    `;
                }
            )
            .join("");


    } catch (error) {

        if (body) {

            body.innerHTML = `
                <div
                    style="
                        padding:25px;
                        text-align:center;
                    "
                >

                    <h3>
                        Could not load reviews
                    </h3>

                    <p>
                        ${escapeHtml(
                            error.message
                        )}
                    </p>

                </div>
            `;
        }
    }
}


/* =========================================================
   REVIEW BUTTON EVENT DELEGATION
   ========================================================= */

function setupReviewButtons() {

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".review-button, [data-review-id]"
                );


            if (!button) {
                return;
            }


            event.preventDefault();


            loadReviews(
                button.dataset.reviewId || "",
                button.dataset.placeId || "",
                button.dataset.placeQuery || ""
            );
        }
    );
}


/* =========================================================
   THEME
   ========================================================= */

function setupTheme() {

    const button =
        document.getElementById(
            "themeToggle"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        () => {

            document.body.classList.toggle(
                "dark"
            );


            const dark =
                document.body.classList.contains(
                    "dark"
                );


            button.textContent =
                dark
                    ? "☀️"
                    : "🌙";


            try {

                localStorage.setItem(
                    "umap-theme",
                    dark
                        ? "dark"
                        : "light"
                );

            } catch {
                /* ignore */
            }
        }
    );


    try {

        const saved =
            localStorage.getItem(
                "umap-theme"
            );


        if (saved === "dark") {

            document.body.classList.add(
                "dark"
            );

            button.textContent =
                "☀️";
        }

    } catch {
        /* ignore */
    }
}


/* =========================================================
   ENTER KEY SUPPORT
   ========================================================= */

function setupSearchEnter() {

    const inputs = [

        document.getElementById(
            "mainQuery"
        ),

        document.getElementById(
            "mainLocation"
        )

    ];


    inputs.forEach(
        input => {

            if (!input) {
                return;
            }


            input.addEventListener(
                "keydown",
                event => {

                    if (
                        event.key ===
                        "Enter"
                    ) {

                        event.preventDefault();

                        performSearch();
                    }
                }
            );
        }
    );
}


/* =========================================================
   AI ENTER KEY
   ========================================================= */

function setupAI() {

    const button =
        document.getElementById(
            "askAIButton"
        );


    const input =
        document.getElementById(
            "aiMessage"
        );


    if (button) {

        button.addEventListener(
            "click",
            askAI
        );
    }


    if (input) {

        input.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    askAI();
                }
            }
        );
    }
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        console.log(
            "U MAP AI frontend starting..."
        );


        initializeMap();


        setupJourneyPlanner();


        setupReviewButtons();


        setupTheme();


        setupSearchEnter();


        setupAI();


        updateStreetViewLink();


        console.log(
            "U MAP AI frontend ready."
        );
    }
);


/* =========================================================
   WINDOW RESIZE
   ========================================================= */

window.addEventListener(
    "resize",
    () => {

        if (map) {

            setTimeout(
                () => {

                    try {
                        map.invalidateSize();
                    } catch {
                        /* ignore */
                    }

                },
                150
            );
        }
    }
); 
/* =========================================================
   RESTAURANT STREET VIEW
   ========================================================= */

function openRestaurantStreetView(
    latitude,
    longitude
) {

    if (
        latitude == null ||
        longitude == null
    ) {
        alert(
            "Street View is not available for this place."
        );

        return;
    }


    const url =
        "https://www.google.com/maps/@?api=1" +
        "&map_action=pano" +
        "&viewpoint=" +
        encodeURIComponent(
            `${latitude},${longitude}`
        );


    window.open(
        url,
        "_blank",
        "noopener"
    );
}


/* =========================================================
   STREET VIEW BUTTONS
   ========================================================= */

document.addEventListener(
    "click",
    function (event) {

        const button =
            event.target.closest(
                ".street-view-place-button"
            );


        if (!button) {
            return;
        }


        event.preventDefault();


        const latitude =
            button.dataset.lat;


        const longitude =
            button.dataset.lng;


        openRestaurantStreetView(
            latitude,
            longitude
        );
    }
); 
/* =========================================================
   U MAP AI CHAT - EMERGENCY RELIABLE SEND FIX
   ========================================================= */

(function () {

    let requestRunning = false;

    let chatHistory = [];

    let isVoiceSession = false;
    let recognition = null;
    let isListening = false;
    let isSpeaking = false;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;


    function getChatElements() {

        return {
            input: document.getElementById("aiChatInput"),
            send: document.getElementById("aiChatSend"),
            messages: document.getElementById("aiChatMessages")
        };
    }


    function escapeAIText(text) {

        return String(text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    /* Convert AI markdown to clean HTML — no raw * or # shown */
    function formatAIResponse(text) {

        const safe = String(text || "");

        const lines = safe.split("\n");

        let html = "";

        let inList = false;

        for (let i = 0; i < lines.length; i++) {

            let line = lines[i];

            /* ---- Headings ---- */
            if (/^#{1,3}\s/.test(line)) {

                if (inList) {
                    html += "</ul>";
                    inList = false;
                }

                const level = line.match(/^(#{1,3})/)[1].length;
                const content = line.replace(/^#{1,3}\s*/, "").trim();

                html +=
                    "<h" + level + " class=\"ai-heading\">" +
                    escapeAIText(content) +
                    "</h" + level + ">";

                continue;
            }

            /* ---- Bullet points: *, -, + at line start ---- */
            if (/^[\*\-\+]\s+/.test(line)) {

                if (!inList) {
                    html += "<ul class=\"ai-list\">";
                    inList = true;
                }

                const content = line.replace(/^[\*\-\+]\s+/, "").trim();

                html +=
                    "<li>" +
                    inlineFormat(escapeAIText(content)) +
                    "</li>";

                continue;
            }

            /* ---- Close list before a non-list line ---- */
            if (inList) {
                html += "</ul>";
                inList = false;
            }

            /* ---- Blank line ---- */
            if (line.trim() === "") {
                html += "<br>";
                continue;
            }

            /* ---- Normal paragraph line ---- */
            html +=
                "<p class=\"ai-para\">" +
                inlineFormat(escapeAIText(line.trim())) +
                "</p>";
        }

        if (inList) {
            html += "</ul>";
        }

        return html;
    }


    /* Handle inline bold (**text**) and italic (*text*) safely */
    function inlineFormat(escaped) {

        return escaped
            /* Bold: **text** or __text__ */
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/__(.+?)__/g, "<strong>$1</strong>")
            /* Italic: *text* or _text_ (single, not already bold) */
            .replace(/\*([^\*]+?)\*/g, "<em>$1</em>")
            .replace(/_([^_]+?)_/g, "<em>$1</em>");
    }


    function addUserMessage(text) {

        const elements = getChatElements();

        if (!elements.messages) {
            return;
        }

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "chat-message user-message";


        const bubble =
            document.createElement("div");

        bubble.className =
            "chat-bubble";


        bubble.innerHTML =
            escapeAIText(text)
                .replace(/\n/g, "<br>");


        wrapper.appendChild(bubble);

        elements.messages.appendChild(wrapper);

        elements.messages.scrollTop =
            elements.messages.scrollHeight;
    }


    function createAssistantMessage() {

        const elements =
            getChatElements();


        if (!elements.messages) {
            return null;
        }


        const wrapper =
            document.createElement("div");

        wrapper.className =
            "chat-message assistant-message";


        const bubble =
            document.createElement("div");

        bubble.className =
            "chat-bubble";


        bubble.innerHTML =
            `
                <span class="ai-streaming-cursor">
                    ✦
                </span>
            `;


        wrapper.appendChild(bubble);

        elements.messages.appendChild(
            wrapper
        );


        elements.messages.scrollTop =
            elements.messages.scrollHeight;


        return bubble;
    }


    async function sendFastAIMessage() {

        if (requestRunning) {
            return;
        }

        if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            isSpeaking = false;
        }


        const elements =
            getChatElements();


        const input =
            elements.input;


        const send =
            elements.send;


        const messages =
            elements.messages;


        if (!input || !messages) {

            console.error(
                "U MAP AI: chat elements not found."
            );

            return;
        }


        const text =
            input.value.trim();


        if (!text) {
            return;
        }


        requestRunning = true;


        addUserMessage(text);


        chatHistory.push({
            role: "user",
            content: text
        });


        /* Keep only recent messages.
           This makes requests faster. */

        if (chatHistory.length > 6) {

            chatHistory =
                chatHistory.slice(-6);
        }


        input.value = "";


        if (send) {

            send.disabled = true;

            send.innerHTML =
                "⏳";
        }


        const bubble =
            createAssistantMessage();


        if (!bubble) {

            requestRunning = false;

            if (send) {
                send.disabled = false;
                send.innerHTML = "➤";
            }

            return;
        }


        let fullReply = "";


        try {

            const response =
                await fetch(
                    "/api/ai-chat-stream",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            "Accept":
                                "text/event-stream"
                        },

                        body:
                            JSON.stringify({
                                messages:
                                    chatHistory
                            })
                    }
                );


            if (!response.ok) {

                let errorMessage =
                    "Gemini request failed.";


                try {

                    const errorData =
                        await response.json();


                    errorMessage =
                        errorData.error ||
                        errorMessage;

                } catch {
                    /* Ignore JSON parsing failure */
                }


                throw new Error(
                    errorMessage
                );
            }


            if (!response.body) {

                throw new Error(
                    "Streaming response is unavailable."
                );
            }


            const reader =
                response.body.getReader();


            const decoder =
                new TextDecoder();


            let buffer = "";


            while (true) {

                const result =
                    await reader.read();


                if (result.done) {
                    break;
                }


                buffer +=
                    decoder.decode(
                        result.value,
                        {
                            stream: true
                        }
                    );


                const events =
                    buffer.split(
                        "\n\n"
                    );


                buffer =
                    events.pop() || "";


                for (
                    const event
                    of events
                ) {

                    const lines =
                        event.split("\n");


                    for (
                        const line
                        of lines
                    ) {

                        if (
                            !line.startsWith(
                                "data:"
                            )
                        ) {
                            continue;
                        }


                        const raw =
                            line
                                .slice(5)
                                .trim();


                        if (!raw) {
                            continue;
                        }


                        let data;


                        try {

                            data =
                                JSON.parse(
                                    raw
                                );

                        } catch {

                            continue;
                        }


                        if (data.error) {

                            throw new Error(
                                data.error
                            );
                        }


                        if (data.text) {

                            fullReply +=
                                data.text;


                            bubble.innerHTML =
                                formatAIResponse(fullReply) +
                                `
                                    <span
                                        class="ai-streaming-cursor"
                                    >
                                        ▌
                                    </span>
                                `;


                            messages.scrollTop =
                                messages.scrollHeight;
                        }
                    }
                }
            }


            if (
                fullReply.trim()
            ) {

                chatHistory.push({
                    role: "assistant",
                    content: fullReply
                });


                if (
                    chatHistory.length > 6
                ) {

                    chatHistory =
                        chatHistory.slice(-6);
                }


                bubble.innerHTML =
                    formatAIResponse(fullReply);

                if (isVoiceSession) {
                    isVoiceSession = false;
                    speakVoiceResponse(fullReply);
                }
            }


        } catch (error) {

            console.error(
                "U MAP AI error:",
                error
            );


            bubble.innerHTML =
                `
                    ⚠️ ${
                        escapeAIText(
                            error.message ||
                            "Could not connect to U MAP AI."
                        )
                    }
                `;

            if (isVoiceSession) {
                isVoiceSession = false;
                speakVoiceResponse(error.message || "I could not connect to U MAP AI.");
            }

        } finally {

            requestRunning =
                false;


            const latest =
                getChatElements();


            if (latest.send) {

                latest.send.disabled =
                    false;

                latest.send.innerHTML =
                    "➤";
            }


            if (latest.input) {
                latest.input.focus();
            }
        }
    }


    /*
       CLICK FIX

       We listen on document instead of directly
       on the button. This works even when app.js
       loads before the HTML chat elements.
    */

    document.addEventListener(
        "click",
        function (event) {

            const button =
                event.target.closest(
                    "#aiChatSend"
                );


            if (!button) {
                return;
            }


            event.preventDefault();

            event.stopPropagation();


            sendFastAIMessage();
        },
        true
    );


    /*
       ENTER KEY FIX
    */

    document.addEventListener(
        "keydown",
        function (event) {

            const input =
                event.target.closest(
                    "#aiChatInput"
                );


            if (!input) {
                return;
            }


            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                event.stopPropagation();


                sendFastAIMessage();
            }
        },
        true
    );


    /*
       FORM SUBMIT FIX

       Prevents the browser from refreshing the
       entire page when the Send button is inside
       a <form>.
    */

    document.addEventListener(
        "submit",
        function (event) {

            const form =
                event.target;


            if (
                form &&
                form.querySelector(
                    "#aiChatInput"
                )
            ) {

                event.preventDefault();

                event.stopPropagation();


                sendFastAIMessage();
            }
        },
        true
    );


    /* =====================================================
       VOICE ASSISTANT IMPLEMENTATION
       ===================================================== */

    function cleanForSpeech(text) {
        if (!text) return "";
        let t = String(text);

        // 1. Remove HTML tags
        t = t.replace(/<[^>]+>/g, " ");

        // 2. Remove markdown links [label](url) -> label
        t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

        // 3. Remove URLs
        t = t.replace(/https?:\/\/\S+/g, " ");

        // 4. Remove code blocks and inline code
        t = t.replace(/```[\s\S]*?```/g, " ");
        t = t.replace(/`[^`]*`/g, " ");

        // 5. Replace numbered lists e.g. "1. Bus 2. Train 3. Flight" -> "Bus. Train. Flight."
        t = t.replace(/(?:^|[\s\-\+•·])\d+[\.\)]\s*/g, ". ");

        // 6. Remove markdown headers #, ##, ###
        t = t.replace(/#+\s*/g, " ");

        // 7. Remove asterisks, underscores, tildes (bold/italic/strikethrough *, **, ***, _, __, ~~)
        t = t.replace(/[*_~]+/g, " ");

        // 8. Remove bullet points (-, +, *, •, ·, –, —)
        t = t.replace(/(?:^|\s)[-+•·–—]\s*/g, ". ");

        // 9. Natural currencies
        t = t.replace(/₹\s*(\d+)/g, "$1 rupees");
        t = t.replace(/₹/g, " rupees ");
        t = t.replace(/\$\s*(\d+)/g, "$1 dollars");
        t = t.replace(/\$/g, " dollars ");
        t = t.replace(/€\s*(\d+)/g, "$1 euros");

        // 10. Remove slashes, backslashes, pipes, brackets, braces, angle brackets, math/special symbols
        t = t.replace(/[\/\\|\[\](){}<>=^#@&%*~`]/g, " ");

        // 11. Remove emojis, variation selectors, and pictographs
        try {
            t = t.replace(/\p{Extended_Pictographic}/gu, " ");
        } catch (e) {
            t = t.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, " ");
        }
        t = t.replace(/[\uFE00-\uFE0F\u200D\u200B]/g, "");

        // 12. Normalize whitespace, newlines, and punctuation
        t = t.replace(/[\r\n]+/g, ". ");
        t = t.replace(/\s*([.,!?])\s*/g, "$1 ");
        t = t.replace(/(?:\s*\.)+/g, ".");
        t = t.replace(/,+/g, ",");
        t = t.replace(/:\./g, ":");
        t = t.replace(/\s+/g, " ").trim();

        // 13. Trim leading / trailing punctuation
        t = t.replace(/^[.,!?:;\s]+/, "");
        if (t && !/[.!?]$/.test(t)) {
            t += ".";
        }
        return t;
    }

    function updateVoiceUI(state, message) {
        const btn = document.getElementById("aiVoiceButton");
        const status = document.getElementById("aiVoiceStatus");

        if (btn) {
            if (state === "listening") {
                btn.classList.add("listening");
                btn.setAttribute("title", "Listening... Click to stop");
            } else {
                btn.classList.remove("listening");
                btn.setAttribute("title", "Start voice assistant");
            }
        }

        if (status && message) {
            status.innerText = message;
        }
    }

    function initSpeechRecognition() {
        if (!SpeechRecognition) return null;
        try {
            const rec = new SpeechRecognition();
            rec.continuous = false;
            rec.interimResults = true;
            rec.lang = navigator.language || "en-US";

            rec.onstart = function () {
                isListening = true;
                updateVoiceUI("listening", "Listening... Speak naturally");
            };

            rec.onresult = function (event) {
                let interim = "";
                let finalTranscript = "";

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }

                const spoken = (finalTranscript || interim).trim();
                const elements = getChatElements();

                if (elements.input && spoken) {
                    elements.input.value = spoken;
                }

                if (spoken) {
                    updateVoiceUI("listening", `Heard: "${spoken}"`);
                }

                if (finalTranscript.trim()) {
                    isVoiceSession = true;
                    // Trigger send
                    setTimeout(() => {
                        sendFastAIMessage();
                    }, 250);
                }
            };

            rec.onerror = function (event) {
                isListening = false;
                console.warn("Speech recognition error:", event.error);
                if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                    updateVoiceUI("idle", "Microphone access blocked. Please allow mic permission.");
                } else if (event.error === "no-speech") {
                    updateVoiceUI("idle", "No speech detected. Click the mic to try again.");
                } else if (event.error === "network") {
                    updateVoiceUI("idle", "Network error. Please check your internet connection.");
                } else if (event.error === "audio-capture") {
                    updateVoiceUI("idle", "No microphone detected on your device.");
                } else if (event.error !== "aborted") {
                    updateVoiceUI("idle", "Voice assistant error. Click mic to retry.");
                } else {
                    updateVoiceUI("idle", "Voice assistant ready");
                }
            };

            rec.onend = function () {
                isListening = false;
                const btn = document.getElementById("aiVoiceButton");
                if (btn) btn.classList.remove("listening");
                if (!isSpeaking && !requestRunning) {
                    const status = document.getElementById("aiVoiceStatus");
                    if (status && status.innerText.startsWith("Listening")) {
                        status.innerText = "Voice assistant ready";
                    }
                }
            };

            return rec;
        } catch (e) {
            console.error("SpeechRecognition initialization failed:", e);
            return null;
        }
    }

    function toggleVoiceAssistant() {
        // If speaking, clicking the mic stops audio immediately
        if (window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
            window.speechSynthesis.cancel();
            isSpeaking = false;
            updateVoiceUI("idle", "Voice assistant ready");
            return;
        }

        if (!SpeechRecognition) {
            updateVoiceUI("idle", "Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
            return;
        }

        if (!recognition) {
            recognition = initSpeechRecognition();
        }

        if (isListening) {
            try {
                recognition.stop();
            } catch (e) {}
            isListening = false;
            updateVoiceUI("idle", "Voice assistant ready");
        } else {
            try {
                recognition.start();
            } catch (e) {
                console.warn("Could not start recognition, reinitializing:", e);
                recognition = initSpeechRecognition();
                try {
                    if (recognition) recognition.start();
                } catch (err) {
                    updateVoiceUI("idle", "Could not start microphone. Click to try again.");
                }
            }
        }
    }

    function speakVoiceResponse(rawReply) {
        if (!("speechSynthesis" in window)) {
            console.warn("Speech synthesis not supported in this browser.");
            updateVoiceUI("idle", "Voice assistant ready");
            return;
        }

        const textToSpeak = cleanForSpeech(rawReply);
        if (!textToSpeak) {
            updateVoiceUI("idle", "Voice assistant ready");
            return;
        }

        try {
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.lang = "en-US";
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            const voices = window.speechSynthesis.getVoices();
            if (voices && voices.length) {
                const preferredVoice = voices.find(v => (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha")) && v.lang.startsWith("en")) || voices.find(v => v.lang.startsWith("en"));
                if (preferredVoice) {
                    utterance.voice = preferredVoice;
                }
            }

            utterance.onstart = function () {
                isSpeaking = true;
                updateVoiceUI("speaking", "Speaking response...");
            };

            utterance.onend = function () {
                isSpeaking = false;
                updateVoiceUI("idle", "Voice assistant ready");
            };

            utterance.onerror = function (e) {
                isSpeaking = false;
                console.warn("Speech synthesis error:", e);
                updateVoiceUI("idle", "Voice assistant ready");
            };

            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.error("Speech synthesis invocation failed:", e);
            isSpeaking = false;
            updateVoiceUI("idle", "Voice assistant ready");
        }
    }

    /*
       VOICE BUTTON CLICK
    */
    document.addEventListener(
        "click",
        function (event) {
            const button = event.target.closest("#aiVoiceButton");
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            toggleVoiceAssistant();
        },
        true
    );

    console.log(
        "U MAP AI reliable chat & voice assistant loaded."
    );

})(); 
// =====================================================
// U Map SEARCH BUTTON FIX
// =====================================================

(function () {

    console.log("U Map Search Fix loaded");


    function runUMapSearch(event) {

        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const button = event && event.target ? event.target.closest("button") : null;
        const isPlace = button && (button.id === "placeSearchBtn" || button.classList.contains("place-search-btn"));

        if (isPlace) {
            console.log("Place Search clicked");
            if (typeof performPlaceSearch === "function") {
                performPlaceSearch();
            } else if (typeof performSearch === "function") {
                performSearch("place");
            }
        } else {
            console.log("Explore clicked");
            if (typeof performExplore === "function") {
                performExplore();
            } else if (typeof performSearch === "function") {
                performSearch("explore");
            }
        }

    }


    // -------------------------------------------------
    // EXPLORE BUTTON
    // -------------------------------------------------

    document.addEventListener(
        "click",
        function (event) {

            const button =
                event.target.closest(
                    ".hero-search button"
                );

            if (!button) {
                return;
            }

            runUMapSearch(event);

        },
        true
    );


    // -------------------------------------------------
    // ENTER KEY
    // -------------------------------------------------

    document.addEventListener(
        "keydown",
        function (event) {

            const input =
                event.target.closest(
                    "#mainQuery, #mainLocation"
                );

            if (!input) {
                return;
            }

            if (
                event.key ===
                "Enter"
            ) {

                runUMapSearch(event);

            }

        },
        true
    );


})(); 
// =====================================================
// U Map FLIGHT SEARCH
// =====================================================

(function () {

    console.log("U Map Flight Search loaded");

    async function searchFlights() {

        const button = document.querySelector(
            'button'
        );

        // Find the actual Search Flights button
        const buttons = Array.from(
            document.querySelectorAll("button")
        );

        const searchButton = buttons.find(
            btn =>
                btn.innerText
                    .trim()
                    .toLowerCase()
                    .includes("search flights")
        );

        if (searchButton) {
            searchButton.disabled = true;
            searchButton.innerText = "Searching...";
        }

        try {

            // Try common IDs first
            const fromInput =
                document.getElementById("flightFrom") ||
                document.getElementById("from") ||
                document.querySelector(
                    'input[placeholder*="From" i]'
                );

            const toInput =
                document.getElementById("flightTo") ||
                document.getElementById("to") ||
                document.querySelector(
                    'input[placeholder*="To" i]'
                );

            const departureInput =
                document.getElementById("flightDeparture") ||
                document.getElementById("departure") ||
                document.querySelector(
                    'input[type="date"]'
                );

            const dateInputs =
                Array.from(
                    document.querySelectorAll(
                        'input[type="date"]'
                    )
                );

            const returnInput =
                document.getElementById("flightReturn") ||
                document.getElementById("return") ||
                dateInputs[1];

            const from =
                fromInput
                    ? fromInput.value.trim()
                    : "";

            const to =
                toInput
                    ? toInput.value.trim()
                    : "";

            const departure =
                departureInput
                    ? departureInput.value
                    : "";

            const returnDate =
                returnInput
                    ? returnInput.value
                    : "";

            if (!from) {
                throw new Error(
                    "Please enter the departure city."
                );
            }

            if (!to) {
                throw new Error(
                    "Please enter the destination."
                );
            }

            if (!departure) {
                throw new Error(
                    "Please select a departure date."
                );
            }

            // Determine round trip / one way
            const pageText =
                document.body.innerText.toLowerCase();

            const isOneWay =
                pageText.includes("one way") &&
                !pageText.includes("round trip selected");

            const type =
                isOneWay ? "2" : "1";

            const params =
                new URLSearchParams({
                    from: from,
                    to: to,
                    departure: departure,
                    return_date: returnDate,
                    type: type
                });

            const response =
                await fetch(
                    `/api/flights?${params.toString()}`
                );

            const data =
                await response.json();

            if (!response.ok || !data.success) {

                throw new Error(
                    data.error ||
                    "Unable to find flights."
                );
            }

            displayFlightResults(
                data.flights || []
            );

        } catch (error) {

            console.error(
                "Flight search error:",
                error
            );

            showFlightMessage(
                "⚠️ " +
                error.message
            );

        } finally {

            if (searchButton) {
                searchButton.disabled = false;
                searchButton.innerText =
                    "Search Flights";
            }

        }
    }


    // -------------------------------------------------
    // DISPLAY FLIGHTS
    // -------------------------------------------------

    function displayFlightResults(
        flights
    ) {

        let results =
            document.getElementById(
                "flightResults"
            );

        if (!results) {

            results =
                document.createElement(
                    "div"
                );

            results.id =
                "flightResults";

            results.style.marginTop =
                "20px";

            const bookingSection =
                document.querySelector(
                    ".booking-section"
                ) ||
                document.querySelector(
                    ".flight-section"
                ) ||
                document.querySelector(
                    "main"
                );

            if (bookingSection) {
                bookingSection.appendChild(
                    results
                );
            }
        }

        if (!flights.length) {

            results.innerHTML = `
                <div class="flight-empty">
                    <h3>No flights found</h3>
                    <p>
                        Try another date or route.
                    </p>
                </div>
            `;

            return;
        }

        results.innerHTML = `
            <div class="flight-results-heading">
                <h3>Available Flights</h3>
                <p>
                    ${flights.length}
                    flight options found
                </p>
            </div>

            ${flights.map(
                flight => {

                    const airline =
                        flight.airline ||
                        "Airline";

                    const flightNumber =
                        flight.flight_number ||
                        "";

                    const departure =
                        flight.departure_time ||
                        "--";

                    const arrival =
                        flight.arrival_time ||
                        "--";

                    const duration =
                        flight.duration ||
                        "--";

                    const stops =
                        flight.stops ||
                        "Direct";

                    const price =
                        flight.price != null
                            ? `₹${flight.price}`
                            : "Price unavailable";

                    return `
                        <div class="flight-card">

                            <div>
                                <strong>
                                    ${escapeHtml(
                                        airline
                                    )}
                                </strong>

                                <div>
                                    ${escapeHtml(
                                        flightNumber
                                    )}
                                </div>
                            </div>

                            <div>
                                <strong>
                                    ${escapeHtml(
                                        departure
                                    )}
                                </strong>

                                <span> → </span>

                                <strong>
                                    ${escapeHtml(
                                        arrival
                                    )}
                                </strong>

                                <small>
                                    ${escapeHtml(
                                        duration
                                    )}
                                    ·
                                    ${escapeHtml(
                                        stops
                                    )}
                                </small>
                            </div>

                            <div>
                                <strong>
                                    ${escapeHtml(
                                        price
                                    )}
                                </strong>
                            </div>

                        </div>
                    `;
                }
            ).join("")}
        `;
    }


    function showFlightMessage(
        message
    ) {

        let results =
            document.getElementById(
                "flightResults"
            );

        if (!results) {

            results =
                document.createElement(
                    "div"
                );

            results.id =
                "flightResults";

            results.style.marginTop =
                "20px";

            document
                .querySelector("main")
                ?.appendChild(results);
        }

        results.innerHTML = `
            <div class="flight-error">
                ${escapeHtml(message)}
            </div>
        `;
    }


    function escapeHtml(
        value
    ) {

        return String(
            value || ""
        )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
    }


    // -------------------------------------------------
    // SEARCH FLIGHTS BUTTON
    // -------------------------------------------------

    document.addEventListener(
        "click",
        function (event) {

            const button =
                event.target.closest(
                    "button"
                );

            if (!button) {
                return;
            }

            if (
                button.innerText
                    .trim()
                    .toLowerCase()
                    .includes(
                        "search flights"
                    )
            ) {

                event.preventDefault();
                event.stopPropagation();

                searchFlights();
            }

        },
        true
    );


})();  
// =====================================================
// U Map FLIGHT SEARCH FIX
// =====================================================

(function () {

    console.log("U Map Flight Search Fix loaded");

    document.addEventListener("click", function (event) {

        const button = event.target.closest("button");

        if (!button) {
            return;
        }

        const buttonText =
            button.innerText.trim().toLowerCase();

        if (
            !buttonText.includes("search flights")
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // ---------------------------------------------
        // FIND FLIGHT INPUTS
        // ---------------------------------------------

        const inputs =
            document.querySelectorAll(
                "input, select"
            );

        let from = "";
        let to = "";
        let departure = "";
        let returnDate = "";

        inputs.forEach(function (input) {

            const text = (
                (input.id || "") +
                " " +
                (input.name || "") +
                " " +
                (input.placeholder || "")
            ).toLowerCase();

            if (
                !from &&
                (
                    text.includes("from") ||
                    text.includes("departure city") ||
                    text.includes("origin")
                )
            ) {
                from = input.value.trim();
            }

            if (
                !to &&
                (
                    text.includes("to") ||
                    text.includes("destination")
                )
            ) {
                to = input.value.trim();
            }

            if (
                !departure &&
                (
                    text.includes("departure") ||
                    text.includes("depart")
                )
            ) {
                departure = input.value.trim();
            }

            if (
                !returnDate &&
                (
                    text.includes("return")
                )
            ) {
                returnDate = input.value.trim();
            }

        });

        // ---------------------------------------------
        // FALLBACK: USE INPUT ORDER
        // ---------------------------------------------

        const dateInputs =
            Array.from(
                document.querySelectorAll(
                    'input[type="date"]'
                )
            );

        if (
            !departure &&
            dateInputs.length >= 1
        ) {
            departure =
                dateInputs[0].value;
        }

        if (
            !returnDate &&
            dateInputs.length >= 2
        ) {
            returnDate =
                dateInputs[1].value;
        }

        // ---------------------------------------------
        // VALIDATION
        // ---------------------------------------------

        if (!from || !to) {

            alert(
                "Please enter both departure and destination."
            );

            return;
        }

        if (!departure) {

            alert(
                "Please select a departure date."
            );

            return;
        }

        // ---------------------------------------------
        // SHOW SEARCHING STATE
        // ---------------------------------------------

        const originalText =
            button.innerHTML;

        button.disabled = true;

        button.innerHTML =
            "Searching Flights...";

        // ---------------------------------------------
        // BUILD GOOGLE FLIGHTS SEARCH
        // ---------------------------------------------

        let query =
            "Flights from " +
            from +
            " to " +
            to +
            " on " +
            departure;

        if (returnDate) {

            query +=
                " returning " +
                returnDate;
        }

        const googleFlightsUrl =
            "https://www.google.com/travel/flights?q=" +
            encodeURIComponent(query);

        // ---------------------------------------------
        // OPEN SEARCH
        // ---------------------------------------------

        setTimeout(function () {

            window.open(
                googleFlightsUrl,
                "_blank",
                "noopener,noreferrer"
            );

            button.disabled = false;

            button.innerHTML =
                originalText;

        }, 300);

    }, true);

})();  
// =====================================================
// U Map BOOKING TABS FIX
// =====================================================

(function () {

    console.log("Booking tabs fix loaded");

    document.addEventListener("click", function (event) {

        const clicked =
            event.target.closest(
                "button, .booking-tab, .travel-tab, .tab"
            );

        if (!clicked) {
            return;
        }

        const text =
            clicked.innerText
                .trim()
                .toLowerCase();

        // Only handle the travel booking tabs
        const bookingTabs = [
            "flights",
            "hotels",
            "trains",
            "buses",
            "cabs",
            "holidays"
        ];

        const matchedTab =
            bookingTabs.find(
                tab => text === tab
            );

        if (!matchedTab) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        console.log(
            "Booking tab clicked:",
            matchedTab
        );

        // Find all booking tab buttons
        const allTabs =
            document.querySelectorAll(
                "button, .booking-tab, .travel-tab, .tab"
            );

        allTabs.forEach(function (tab) {

            const tabText =
                tab.innerText
                    .trim()
                    .toLowerCase();

            if (
                bookingTabs.includes(
                    tabText
                )
            ) {
                tab.classList.remove("active");
            }

        });

        clicked.classList.add("active");

        // Find booking panels
        const panels =
            document.querySelectorAll(
                "[data-booking-type], " +
                ".booking-panel, " +
                ".travel-panel"
            );

        panels.forEach(function (panel) {

            panel.style.display = "none";

        });

        // Try to find the matching panel
        const possibleIds = [
            matchedTab + "Booking",
            matchedTab + "Panel",
            matchedTab + "-booking",
            matchedTab + "-panel"
        ];

        let panelFound = false;

        possibleIds.forEach(function (id) {

            const panel =
                document.getElementById(id);

            if (panel) {

                panel.style.display = "block";
                panelFound = true;

            }

        });

        // If the existing page uses a generic form,
        // keep the flight form visible for Flights.
        if (
            matchedTab === "flights" &&
            !panelFound
        ) {

            const flightElements =
                document.querySelectorAll(
                    "#flightForm, " +
                    ".flight-form, " +
                    "[data-type='flight']"
                );

            flightElements.forEach(function (element) {

                element.style.display = "block";

            });

        }

    }, true);

})(); 
// =====================================================
// U Map BOOKING TABS FIX
// =====================================================

document.addEventListener("DOMContentLoaded", function () {

    console.log("U Map booking tabs loaded");

    const tabs = document.querySelectorAll(".travel-tab");
    const forms = document.querySelectorAll(".travel-form");

    console.log("Booking tabs found:", tabs.length);
    console.log("Booking forms found:", forms.length);

    tabs.forEach(function (tab) {

        tab.addEventListener("click", function (event) {

            event.preventDefault();

            const service = tab.getAttribute("data-service");

            console.log("Booking tab clicked:", service);

            if (!service) {
                return;
            }

            // Remove active from every tab
            tabs.forEach(function (item) {
                item.classList.remove("active");
            });

            // Hide every booking form
            forms.forEach(function (form) {
                form.classList.remove("active");
            });

            // Activate clicked tab
            tab.classList.add("active");

            // Find matching form
            const targetForm =
                document.getElementById(
                    "travelForm-" + service
                );

            if (targetForm) {

                targetForm.classList.add("active");

                console.log(
                    "Opened booking form:",
                    "travelForm-" + service
                );

                targetForm.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest"
                });

            } else {

                console.error(
                    "Booking form not found:",
                    "travelForm-" + service
                );

            }

        });

    });

}); 
// ============================================================
// U Map TRAVEL BOOKING - COMPLETE PROTOTYPE FIX
// ============================================================

(function () {

    console.log("U Map Travel Booking loaded");

    // --------------------------------------------------------
    // 1. TAB SWITCHING
    // --------------------------------------------------------

    function activateTravelService(service) {
        if (typeof window.openTravelTab === "function") {
            window.openTravelTab(service);
            return;
        }

        const tabs =
            document.querySelectorAll(".travel-tab");

        const forms =
            document.querySelectorAll(".travel-form");

        tabs.forEach(function (tab) {
            const isActive = tab.getAttribute("data-service") === service;
            tab.classList.toggle("active", isActive);
        });

        forms.forEach(function (form) {
            const isActive = form.getAttribute("data-service") === service || form.id === ("travelForm-" + service);
            form.classList.toggle("active", isActive);
            if (isActive) {
                form.style.display = "";
            } else {
                form.style.display = "none";
            }
        });

        if (typeof window.clearAllTravelResultContainers === "function") {
            window.clearAllTravelResultContainers();
        } else {
            ["travelBookingResults", "bookingResults", "travelResults", "umapTravelResults", "umapBookingResults"].forEach(function (id) {
                const el = document.getElementById(id);
                if (el) { el.innerHTML = ""; el.style.display = "none"; }
            });
        }

        if (window.travelServiceResults && window.travelServiceResults[service]) {
            const container = document.getElementById("travelBookingResults") || document.getElementById("bookingResults");
            if (container) {
                container.innerHTML = window.travelServiceResults[service];
                container.style.display = "block";
            }
        }

        console.log(
            "Travel service activated:",
            service
        );
    }


    // --------------------------------------------------------
    // 2. TAB CLICK HANDLER
    // --------------------------------------------------------

    document.addEventListener(
        "click",
        function (event) {

            const tab =
                event.target.closest(".travel-tab");

            if (!tab) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const service =
                tab.getAttribute("data-service");

            if (!service) {
                return;
            }

            activateTravelService(service);

        },
        true
    );


    // --------------------------------------------------------
    // 3. SAMPLE FLIGHT DATA
    // --------------------------------------------------------

    const sampleFlights = [

        {
            airline: "Air India",
            flight: "AI 539",
            departure: "06:10",
            arrival: "08:15",
            duration: "2h 05m",
            stops: "Non-stop",
            price: 5480,
            baggage: "15 kg",
            type: "Direct"
        },

        {
            airline: "IndiGo",
            flight: "6E 6114",
            departure: "09:25",
            arrival: "11:35",
            duration: "2h 10m",
            stops: "Non-stop",
            price: 5890,
            baggage: "15 kg",
            type: "Direct"
        },

        {
            airline: "Akasa Air",
            flight: "QP 1320",
            departure: "13:40",
            arrival: "15:50",
            duration: "2h 10m",
            stops: "Non-stop",
            price: 6120,
            baggage: "15 kg",
            type: "Direct"
        },

        {
            airline: "IndiGo",
            flight: "6E 6211",
            departure: "18:20",
            arrival: "20:35",
            duration: "2h 15m",
            stops: "Non-stop",
            price: 6340,
            baggage: "15 kg",
            type: "Direct"
        }

    ];


    // --------------------------------------------------------
    // 4. GET FLIGHT FORM VALUES
    // --------------------------------------------------------

    function getFlightValues() {

        const form =
            document.getElementById(
                "travelForm-flights"
            );

        if (!form) {
            return null;
        }

        const inputs =
            form.querySelectorAll("input");

        const textInputs =
            Array.from(inputs).filter(
                function (input) {

                    return (
                        input.type === "text" ||
                        input.type === "date" ||
                        input.type === "number"
                    );

                }
            );

        const from =
            textInputs[0]
                ? textInputs[0].value.trim()
                : "";

        const to =
            textInputs[1]
                ? textInputs[1].value.trim()
                : "";

        const dates =
            form.querySelectorAll(
                'input[type="date"]'
            );

        const departure =
            dates[0]
                ? dates[0].value
                : "";

        const returnDate =
            dates[1]
                ? dates[1].value
                : "";

        const direct =
            document.getElementById(
                "flightDirect"
            );

        return {

            from:
                from || "Chennai",

            to:
                to || "Mumbai",

            departure:
                departure,

            returnDate:
                returnDate,

            direct:
                direct
                    ? direct.checked
                    : false

        };

    }


    // --------------------------------------------------------
    // 5. CREATE BOOKING RESULTS AREA
    // --------------------------------------------------------

    function getBookingResultsContainer() {

        let container =
            document.getElementById(
                "travelBookingResults"
            );

        if (container) {
            return container;
        }

        container =
            document.createElement("div");

        container.id =
            "travelBookingResults";

        container.style.marginTop =
            "28px";

        const bookingSection =
            document.querySelector(
                ".travel-form.active"
            );

        if (bookingSection) {

            bookingSection.parentElement
                .appendChild(container);

        } else {

            document.body.appendChild(
                container
            );

        }

        return container;

    }


    // --------------------------------------------------------
    // 6. DISPLAY FLIGHTS
    // --------------------------------------------------------

    function displayFlights(values) {

        const container =
            getBookingResultsContainer();

        let flights =
            [...sampleFlights];

        if (values.direct) {

            flights =
                flights.filter(
                    function (flight) {

                        return (
                            flight.type ===
                            "Direct"
                        );

                    }
                );

        }

        container.innerHTML = `

            <div class="booking-results-panel">

                <div class="booking-results-header">

                    <div>

                        <h2>
                            Flight Results
                        </h2>

                        <p>
                            ${values.from}
                            →
                            ${values.to}
                        </p>

                        <small>
                            Prototype results —
                            prices are sample values
                        </small>

                    </div>

                    <div class="booking-sort">

                        <button
                            type="button"
                            data-sort="price"
                        >
                            Cheapest
                        </button>

                        <button
                            type="button"
                            data-sort="duration"
                        >
                            Fastest
                        </button>

                    </div>

                </div>

                <div id="flightResultList"></div>

                <div class="booking-powered-note">

                    ✈️ Flight results shown here are
                    prototype/sample data for the
                    U Map student project.

                </div>

            </div>

        `;

        const list =
            document.getElementById(
                "flightResultList"
            );

        flights.forEach(
            function (flight, index) {

                const card =
                    document.createElement("div");

                card.className =
                    "flight-result-card";

                card.innerHTML = `

                    <div class="flight-main">

                        <div class="airline-info">

                            <strong>
                                ${flight.airline}
                            </strong>

                            <span>
                                ${flight.flight}
                            </span>

                        </div>

                        <div class="flight-time">

                            <strong>
                                ${flight.departure}
                            </strong>

                            <span>
                                ${values.from}
                            </span>

                        </div>

                        <div class="flight-duration">

                            <span>
                                ${flight.duration}
                            </span>

                            <small>
                                ─────────
                            </small>

                            <span>
                                ${flight.stops}
                            </span>

                        </div>

                        <div class="flight-time">

                            <strong>
                                ${flight.arrival}
                            </strong>

                            <span>
                                ${values.to}
                            </span>

                        </div>

                        <div class="flight-price">

                            <strong>
                                ₹${flight.price.toLocaleString("en-IN")}
                            </strong>

                            <span>
                                ${flight.baggage}
                            </span>

                            <button
                                type="button"
                                class="select-flight-btn"
                                data-index="${index}"
                            >
                                Select
                            </button>

                        </div>

                    </div>

                    <div class="flight-details">

                        <span>
                            ${flight.stops}
                        </span>

                        <span>
                            Economy
                        </span>

                        <span>
                            Baggage: ${flight.baggage}
                        </span>

                        <span>
                            Cancellation/rescheduling
                            subject to fare rules
                        </span>

                    </div>

                `;

                list.appendChild(card);

            }
        );

        container.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    }


    // --------------------------------------------------------
    // 7. HOTEL / TRAIN / BUS / CAB / HOLIDAY DEMO RESULTS
    // --------------------------------------------------------

    function displayGenericResults(service) {

        const container =
            getBookingResultsContainer();

        const names = {

            hotels: "Hotels",

            trains: "Trains",

            buses: "Buses",

            cabs: "Cabs",

            holidays:
                "Holiday Packages"

        };

        const name =
            names[service] || "Travel Options";

        container.innerHTML = `

            <div class="booking-results-panel">

                <div class="booking-results-header">

                    <div>

                        <h2>
                            ${name} Results
                        </h2>

                        <p>
                            Compare available
                            ${name.toLowerCase()}
                        </p>

                        <small>
                            Prototype/sample results
                        </small>

                    </div>

                </div>

                <div class="generic-result-grid">

                    ${createGenericCard(service)}

                    ${createGenericCard(service)}

                    ${createGenericCard(service)}

                </div>

            </div>

        `;

        container.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    }


    function createGenericCard(service) {

        const data = {

            hotels: {
                title: "Premium City Hotel",
                info: "4.4 ★ • Breakfast included",
                price: "₹3,499/night"
            },

            trains: {
                title: "Express Intercity",
                info: "AC Chair Car • Available seats",
                price: "₹850"
            },

            buses: {
                title: "Volvo AC Sleeper",
                info: "Comfortable seats • Multiple boarding points",
                price: "₹1,250"
            },

            cabs: {
                title: "Sedan Cab",
                info: "AC • 4 seats • Door-to-door",
                price: "₹1,099"
            },

            holidays: {
                title: "City Explorer Package",
                info: "3 nights • Hotel + sightseeing",
                price: "₹12,999"
            }

        };

        const item =
            data[service] || {

                title: "Travel Option",

                info: "Prototype result",

                price: "₹999"

            };

        return `

            <div class="generic-result-card">

                <h3>
                    ${item.title}
                </h3>

                <p>
                    ${item.info}
                </p>

                <strong>
                    ${item.price}
                </strong>

                <button
                    type="button"
                    class="select-generic-btn"
                >
                    Select
                </button>

            </div>

        `;

    }


    // --------------------------------------------------------
    // 8. GLOBAL SEARCH FUNCTION
    // --------------------------------------------------------

    window.searchTravelService =
        function (service) {

            console.log(
                "Searching travel service:",
                service
            );

            const form =
                document.getElementById(
                    "travelForm-" + service
                );

            if (!form) {

                console.error(
                    "Travel form not found:",
                    service
                );

                return;

            }

            // Prevent HTML form submission
            

            activateTravelService(
                service
            );

            if (service === "flights") {

                const values =
                    getFlightValues();

                if (!values) {
                    return;
                }

                if (
                    !values.from ||
                    !values.to
                ) {

                    alert(
                        "Please enter From and To."
                    );

                    return;

                }

                displayFlights(values);

                return;

            }

            displayGenericResults(
                service
            );

        };


    // --------------------------------------------------------
    // 9. SELECT FLIGHT
    // --------------------------------------------------------

    document.addEventListener(
        "click",
        function (event) {

            const button =
                event.target.closest(
                    ".select-flight-btn"
                );

            if (!button) {
                return;
            }

            const index =
                Number(
                    button.dataset.index
                );

            const flight =
                sampleFlights[index];

            if (!flight) {
                return;
            }

            showPassengerDetails(
                flight
            );

        }
    );


    // --------------------------------------------------------
    // 10. PASSENGER DETAILS
    // --------------------------------------------------------

    function showPassengerDetails(flight) {

        const container =
            getBookingResultsContainer();

        container.innerHTML = `

            <div class="booking-checkout-panel">

                <h2>
                    Passenger Details
                </h2>

                <p>
                    ${flight.airline}
                    ${flight.flight}
                    • ${flight.departure}
                    → ${flight.arrival}
                </p>

                <div class="checkout-grid">

                    <input
                        id="passengerName"
                        type="text"
                        placeholder="Passenger full name"
                    >

                    <input
                        id="passengerEmail"
                        type="email"
                        placeholder="Email address"
                    >

                    <input
                        id="passengerPhone"
                        type="tel"
                        placeholder="Phone number"
                    >

                </div>

                <div class="fare-summary">

                    <span>
                        Base fare
                    </span>

                    <strong>
                        ₹${flight.price.toLocaleString("en-IN")}
                    </strong>

                </div>

                <div class="fare-summary">

                    <span>
                        Taxes & fees
                    </span>

                    <strong>
                        ₹650
                    </strong>

                </div>

                <div class="fare-summary total">

                    <span>
                        Total
                    </span>

                    <strong>
                        ₹${(
                            flight.price + 650
                        ).toLocaleString("en-IN")}
                    </strong>

                </div>

                <p class="prototype-warning">

                    Prototype booking:
                    no real payment or ticket
                    will be processed.

                </p>

                <button
                    type="button"
                    id="confirmPrototypeBooking"
                >
                    Continue to Review
                </button>

            </div>

        `;

        container.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        document
            .getElementById(
                "confirmPrototypeBooking"
            )
            ?.addEventListener(
                "click",
                function () {

                    const name =
                        document
                            .getElementById(
                                "passengerName"
                            )
                            ?.value
                            .trim();

                    if (!name) {

                        alert(
                            "Please enter passenger name."
                        );

                        return;

                    }

                    showConfirmation(
                        name,
                        flight
                    );

                }
            );

    }


    // --------------------------------------------------------
    // 11. CONFIRMATION
    // --------------------------------------------------------

    function showConfirmation(
        passengerName,
        flight
    ) {

        const container =
            getBookingResultsContainer();

        const reference =
            "NS" +
            Math.floor(
                100000 +
                Math.random() * 900000
            );

        container.innerHTML = `

            <div class="booking-confirmation">

                <div class="confirmation-icon">
                    ✓
                </div>

                <h2>
                    Booking Confirmed
                </h2>

                <p>
                    Prototype booking created
                    successfully.
                </p>

                <div class="confirmation-details">

                    <p>
                        <strong>
                            Passenger:
                        </strong>
                        ${passengerName}
                    </p>

                    <p>
                        <strong>
                            Flight:
                        </strong>
                        ${flight.airline}
                        ${flight.flight}
                    </p>

                    <p>
                        <strong>
                            Journey:
                        </strong>
                        ${flight.departure}
                        → ${flight.arrival}
                    </p>

                    <p>
                        <strong>
                            Reference:
                        </strong>
                        ${reference}
                    </p>

                </div>

                <p class="prototype-warning">

                    This is a student-project prototype.
                    No real ticket or payment has been issued.

                </p>

            </div>

        `;

        container.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
  
    }


    // --------------------------------------------------------
    // 12. INITIALIZE
    // --------------------------------------------------------

    document.addEventListener(
        "DOMContentLoaded",
        function () {

            const activeTab =
                document.querySelector(
                    ".travel-tab.active"
                );

            if (activeTab) {

                activateTravelService(
                    activeTab.getAttribute(
                        "data-service"
                    )
                );

            } else {

                activateTravelService(
                    "flights"
                );

            }

            console.log(
                "Travel booking system ready."
            );

        }
    );

})(); 
// =====================================================
// U Map BOOKING SEARCH - FINAL
// =====================================================

window.searchTravelService = function(service) {

    console.log("BOOKING SEARCH:", service);

    const form = document.getElementById(
        "travelForm-" + service
    );

    if (!form) {
        alert("Booking form not found: " + service);
        return;
    }

    // Remove previous results
    const old = document.getElementById(
        "umapBookingResults"
    );

    if (old) {
        old.remove();
    }

    const results = document.createElement("div");

    results.id = "umapBookingResults";

    results.style.cssText = `
        margin-top:25px;
        padding:24px;
        background:#ffffff;
        border:1px solid #e5e7eb;
        border-radius:16px;
        box-shadow:0 10px 30px rgba(0,0,0,.08);
    `;

    if (service === "flights") {

        results.innerHTML = `
            <h2>✈️ Available Flights</h2>

            <p>
                Chennai → Mumbai
            </p>

            <div style="
                padding:18px;
                margin-top:15px;
                border:1px solid #ddd;
                border-radius:12px;
            ">

                <strong>Air India — AI 539</strong>

                <p>
                    06:10 Chennai
                    → 08:15 Mumbai
                </p>

                <p>
                    Duration: 2h 05m · Non-stop
                </p>

                <strong>₹5,480</strong>

                <br>

                <button
                    type="button"
                    onclick="alert('Flight selected — passenger details coming next')"
                    style="
                        margin-top:12px;
                        padding:10px 18px;
                        border:0;
                        border-radius:8px;
                        background:#151827;
                        color:white;
                        cursor:pointer;
                    "
                >
                    Select Flight
                </button>

            </div>

            <div style="
                padding:18px;
                margin-top:15px;
                border:1px solid #ddd;
                border-radius:12px;
            ">

                <strong>IndiGo — 6E 6114</strong>

                <p>
                    09:25 Chennai
                    → 11:35 Mumbai
                </p>

                <p>
                    Duration: 2h 10m · Non-stop
                </p>

                <strong>₹5,890</strong>

                <br>

                <button
                    type="button"
                    onclick="alert('Flight selected — passenger details coming next')"
                    style="
                        margin-top:12px;
                        padding:10px 18px;
                        border:0;
                        border-radius:8px;
                        background:#151827;
                        color:white;
                        cursor:pointer;
                    "
                >
                    Select Flight
                </button>

            </div>

            <small style="
                display:block;
                margin-top:15px;
                color:#777;
            ">
                Prototype/sample flight results.
            </small>
        `;

    } else {

        const names = {
            hotels: "🏨 Hotels",
            trains: "🚆 Trains",
            buses: "🚌 Buses",
            cabs: "🚕 Cabs",
            holidays: "🌴 Holiday Packages"
        };

        results.innerHTML = `
            <h2>${names[service] || "Travel Options"}</h2>

            <div style="
                margin-top:15px;
                padding:20px;
                border:1px solid #ddd;
                border-radius:12px;
            ">

                <h3>
                    ${names[service] || "Travel Option"}
                </h3>

                <p>
                    Available options will appear here.
                </p>

                <button
                    type="button"
                    onclick="alert('Option selected')"
                    style="
                        padding:10px 18px;
                        border:0;
                        border-radius:8px;
                        background:#151827;
                        color:white;
                        cursor:pointer;
                    "
                >
                    Select
                </button>

            </div>
        `;
    }

    form.parentElement.appendChild(results);

    results.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
};

console.log(
    "U Map searchTravelService:",
    typeof window.searchTravelService
); /* =========================================================
   U Map BOOKING MODULE - FINAL FIX
   ========================================================= */

(function () {
    "use strict";

    console.log("U Map Booking Module loaded");

    var bookingData = {
        flights: [
            {
                airline: "IndiGo",
                flight: "6E 681",
                from: "Chennai (MAA)",
                to: "Mumbai (BOM)",
                departure: "06:00",
                arrival: "08:05",
                duration: "2h 05m",
                stops: "Non-stop",
                price: 5249
            },
            {
                airline: "Air India",
                flight: "AI 571",
                from: "Chennai (MAA)",
                to: "Mumbai (BOM)",
                departure: "09:15",
                arrival: "11:25",
                duration: "2h 10m",
                stops: "Non-stop",
                price: 5899
            },
            {
                airline: "Akasa Air",
                flight: "QP 1304",
                from: "Chennai (MAA)",
                to: "Mumbai (BOM)",
                departure: "14:30",
                arrival: "16:40",
                duration: "2h 10m",
                stops: "Non-stop",
                price: 6125
            }
        ],

        hotels: [
            {
                name: "The Grand Central Hotel",
                location: "Mumbai",
                rating: "4.4",
                price: 3299
            },
            {
                name: "City Comfort Inn",
                location: "Mumbai",
                rating: "4.1",
                price: 2499
            },
            {
                name: "Urban Stay Mumbai",
                location: "Mumbai",
                rating: "4.3",
                price: 2899
            }
        ],

        trains: [
            {
                name: "Chennai - Mumbai Express",
                number: "22160",
                departure: "13:40",
                arrival: "16:20",
                duration: "26h 40m",
                price: 845
            },
            {
                name: "Chennai - Mumbai Superfast",
                number: "12164",
                departure: "18:30",
                arrival: "20:15",
                duration: "25h 45m",
                price: 1120
            }
        ],

        buses: [
            {
                operator: "SRS Travels",
                departure: "18:00",
                arrival: "12:30",
                duration: "18h 30m",
                price: 1450
            },
            {
                operator: "Orange Tours",
                departure: "20:15",
                arrival: "14:00",
                duration: "17h 45m",
                price: 1599
            }
        ],

        cabs: [
            {
                provider: "NaviCab",
                vehicle: "Sedan",
                passengers: 4,
                price: 8500
            },
            {
                provider: "NaviCab",
                vehicle: "SUV",
                passengers: 6,
                price: 11200
            }
        ],

        holidays: [
            {
                name: "Mumbai Explorer",
                duration: "3 Days / 2 Nights",
                price: 8999
            },
            {
                name: "Mumbai City Escape",
                duration: "4 Days / 3 Nights",
                price: 12499
            }
        ]
    };

    function money(value) {
        return "₹" + Number(value).toLocaleString("en-IN");
    }

    function getResultsContainer() {
        var container = document.getElementById("travelResults");

        if (!container) {
            container = document.createElement("div");
            container.id = "travelResults";
            container.className = "travel-results";

            var bookingSection =
                document.querySelector(".booking-section") ||
                document.querySelector("#booking") ||
                document.querySelector(".travel-booking") ||
                document.querySelector(".travel-tabs");

            if (bookingSection && bookingSection.parentNode) {
                bookingSection.parentNode.appendChild(container);
            } else {
                document.body.appendChild(container);
            }
        }

        return container;
    }

    function showResults(service) {
        var results = bookingData[service] || [];
        var container = getResultsContainer();

        var html =
            '<div class="travel-results-header">' +
            "<h2>" +
            service.charAt(0).toUpperCase() +
            service.slice(1) +
            " Results</h2>" +
            "<p>" +
            results.length +
            " options available</p>" +
            "</div>";

        if (!results.length) {
            html += "<p>No results available.</p>";
            container.innerHTML = html;
            container.scrollIntoView({ behavior: "smooth" });
            return;
        }

        results.forEach(function (item, index) {
            html += '<div class="travel-result-card">';

            if (service === "flights") {
                html +=
                    "<h3>✈️ " +
                    item.airline +
                    "</h3>" +
                    "<p><strong>" +
                    item.flight +
                    "</strong></p>" +
                    '<div class="travel-route">' +
                    "<span>" +
                    item.departure +
                    "<small>" +
                    item.from +
                    "</small></span>" +
                    "<span>→</span>" +
                    "<span>" +
                    item.arrival +
                    "<small>" +
                    item.to +
                    "</small></span>" +
                    "</div>" +
                    "<p>⏱ " +
                    item.duration +
                    " &nbsp; • &nbsp; " +
                    item.stops +
                    "</p>" +
                    "<p>🧳 Cabin baggage included</p>" +
                    '<div class="travel-price">' +
                    money(item.price) +
                    "</div>";
            }

            if (service === "hotels") {
                html +=
                    "<h3>🏨 " +
                    item.name +
                    "</h3>" +
                    "<p>📍 " +
                    item.location +
                    "</p>" +
                    "<p>⭐ " +
                    item.rating +
                    "/5</p>" +
                    '<div class="travel-price">' +
                    money(item.price) +
                    " / night</div>";
            }

            if (service === "trains") {
                html +=
                    "<h3>🚆 " +
                    item.name +
                    "</h3>" +
                    "<p>Train No: " +
                    item.number +
                    "</p>" +
                    "<p>" +
                    item.departure +
                    " → " +
                    item.arrival +
                    "</p>" +
                    "<p>⏱ " +
                    item.duration +
                    "</p>" +
                    '<div class="travel-price">' +
                    money(item.price) +
                    "</div>";
            }

            if (service === "buses") {
                html +=
                    "<h3>🚌 " +
                    item.operator +
                    "</h3>" +
                    "<p>" +
                    item.departure +
                    " → " +
                    item.arrival +
                    "</p>" +
                    "<p>⏱ " +
                    item.duration +
                    "</p>" +
                    '<div class="travel-price">' +
                    money(item.price) +
                    "</div>";
            }

            if (service === "cabs") {
                html +=
                    "<h3>🚕 " +
                    item.provider +
                    "</h3>" +
                    "<p>" +
                    item.vehicle +
                    " • Up to " +
                    item.passengers +
                    " passengers</p>" +
                    '<div class="travel-price">' +
                    money(item.price) +
                    "</div>";
            }

            if (service === "holidays") {
                html +=
                    "<h3>🌴 " +
                    item.name +
                    "</h3>" +
                    "<p>⏱ " +
                    item.duration +
                    "</p>" +
                    '<div class="travel-price">' +
                    money(item.price) +
                    "</div>";
            }

            html +=
                '<button type="button" class="travel-select-btn" data-service="' +
                service +
                '" data-index="' +
                index +
                '">' +
                "Select" +
                "</button>";

            html += "</div>";
        });

        container.innerHTML = html;

        container.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    /*
     * IMPORTANT:
     * This is the function your HTML currently calls:
     * onclick="searchTravelService('flights')"
     */
    window.searchTravelService = function (service) {
        console.log("Searching travel service:", service);

        if (!bookingData[service]) {
            console.error("Unknown travel service:", service);
            return;
        }

        showResults(service);
    };

    function activateTab(service) {
        if (typeof window.openTravelTab === "function") {
            window.openTravelTab(service);
            return;
        }

        document.querySelectorAll(".travel-tab").forEach(function (tab) {
            var active = tab.getAttribute("data-service") === service;
            tab.classList.toggle("active", active);
        });

        document.querySelectorAll(".travel-form").forEach(function (form) {
            var active = form.getAttribute("data-service") === service || form.id === ("travelForm-" + service);
            form.classList.toggle("active", active);

            if (active) {
                form.style.display = "";
            } else {
                form.style.display = "none";
            }
        });

        if (typeof window.clearAllTravelResultContainers === "function") {
            window.clearAllTravelResultContainers();
        } else {
            ["travelBookingResults", "bookingResults", "travelResults", "umapTravelResults", "umapBookingResults"].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) { el.innerHTML = ""; el.style.display = "none"; }
            });
        }

        if (window.travelServiceResults && window.travelServiceResults[service]) {
            var container = document.getElementById("travelBookingResults") || document.getElementById("bookingResults");
            if (container) {
                container.innerHTML = window.travelServiceResults[service];
                container.style.display = "block";
            }
        }
    }

    document.addEventListener("click", function (event) {
        var tab = event.target.closest(".travel-tab");

        if (tab) {
            event.preventDefault();

            var service = tab.getAttribute("data-service");

            if (service) {
                activateTab(service);
            }

            return;
        }

        var selectButton =
            event.target.closest(".travel-select-btn");

        if (selectButton) {
            event.preventDefault();

            var service =
                selectButton.getAttribute("data-service");

            var index =
                Number(
                    selectButton.getAttribute("data-index")
                );

            var selected =
                bookingData[service] &&
                bookingData[service][index];

            if (!selected) {
                return;
            }

            alert(
                "Selected " +
                service +
                " option.\n\n" +
                "Price: " +
                money(selected.price) +
                "\n\nDemo booking flow ready."
            );
        }
    });

    document.addEventListener("DOMContentLoaded", function () {
        var activeTab =
            document.querySelector(".travel-tab.active");

        if (activeTab) {
            var service =
                activeTab.getAttribute("data-service");

            if (service) {
                activateTab(service);
            }
        }

        console.log("U Map booking system ready");
    });
})(); 
/* =========================================================
   U Map BOOKING SYSTEM - FINAL FIX
   ========================================================= */

(function () {
    "use strict";

    console.log("U Map Booking System Loaded");

    var bookingData = {

        flights: [
            {
                airline: "IndiGo",
                flight: "6E 681",
                from: "Chennai (MAA)",
                to: "Mumbai (BOM)",
                departure: "06:00",
                arrival: "08:05",
                duration: "2h 05m",
                stops: "Non-stop",
                price: 5249
            },
            {
                airline: "Air India",
                flight: "AI 571",
                from: "Chennai (MAA)",
                to: "Mumbai (BOM)",
                departure: "09:15",
                arrival: "11:25",
                duration: "2h 10m",
                stops: "Non-stop",
                price: 5899
            },
            {
                airline: "Akasa Air",
                flight: "QP 1304",
                from: "Chennai (MAA)",
                to: "Mumbai (BOM)",
                departure: "14:30",
                arrival: "16:40",
                duration: "2h 10m",
                stops: "Non-stop",
                price: 6125
            }
        ],

        hotels: [
            {
                name: "The Grand Central Hotel",
                location: "Mumbai",
                rating: "4.4",
                price: 3299
            },
            {
                name: "City Comfort Inn",
                location: "Mumbai",
                rating: "4.1",
                price: 2499
            },
            {
                name: "Urban Stay Mumbai",
                location: "Mumbai",
                rating: "4.3",
                price: 2899
            }
        ],

        trains: [
            {
                name: "Chennai - Mumbai Express",
                number: "22160",
                departure: "13:40",
                arrival: "16:20",
                duration: "26h 40m",
                price: 845
            },
            {
                name: "Chennai - Mumbai Superfast",
                number: "12164",
                departure: "18:30",
                arrival: "20:15",
                duration: "25h 45m",
                price: 1120
            }
        ],

        buses: [
            {
                operator: "SRS Travels",
                departure: "18:00",
                arrival: "12:30",
                duration: "18h 30m",
                price: 1450
            },
            {
                operator: "Orange Tours",
                departure: "20:15",
                arrival: "14:00",
                duration: "17h 45m",
                price: 1599
            }
        ],

        cabs: [
            {
                provider: "NaviCab",
                vehicle: "Sedan",
                passengers: 4,
                price: 8500
            },
            {
                provider: "NaviCab",
                vehicle: "SUV",
                passengers: 6,
                price: 11200
            }
        ],

        holidays: [
            {
                name: "Mumbai Explorer",
                duration: "3 Days / 2 Nights",
                price: 8999
            },
            {
                name: "Mumbai City Escape",
                duration: "4 Days / 3 Nights",
                price: 12499
            }
        ]
    };


    /* =====================================================
       MONEY FORMAT
       ===================================================== */

    function bookingMoney(value) {

        return "₹" +
            Number(value || 0)
                .toLocaleString("en-IN");
    }


    /* =====================================================
       HTML ESCAPE
       ===================================================== */

    function bookingEscape(value) {

        return String(
            value == null ? "" : value
        )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }


    /* =====================================================
       FIND / CREATE RESULT AREA
       ===================================================== */

    function getBookingResults() {

        var box =
            document.getElementById(
                "travelResults"
            );


        if (!box) {

            box =
                document.createElement(
                    "div"
                );

            box.id =
                "travelResults";

            box.className =
                "travel-results";


            var anchor =
                document.querySelector(
                    ".travel-booking"
                ) ||
                document.querySelector(
                    ".booking-section"
                ) ||
                document.querySelector(
                    ".travel-tabs"
                ) ||
                document.querySelector(
                    ".travel-form"
                );


            if (
                anchor &&
                anchor.parentNode
            ) {

                anchor.parentNode.appendChild(
                    box
                );

            } else {

                document.body.appendChild(
                    box
                );
            }
        }


        return box;
    }


    /* =====================================================
       RENDER RESULTS
       ===================================================== */

    function renderBookingResults(
        service
    ) {

        var results =
            bookingData[service] || [];


        var box =
            getBookingResults();


        var title =
            service.charAt(0).toUpperCase() +
            service.slice(1);


        var html =

            '<div class="travel-results-header">' +

                '<h2>' +
                    title +
                    ' Results' +
                '</h2>' +

                '<p>' +
                    results.length +
                    ' options available' +
                '</p>' +

            '</div>';


        results.forEach(
            function (
                item,
                index
            ) {

                html +=
                    '<div class="travel-result-card">';


                /* =========================
                   FLIGHTS
                   ========================= */

                if (
                    service ===
                    "flights"
                ) {

                    html +=

                        '<h3>✈️ ' +
                            bookingEscape(
                                item.airline
                            ) +
                        '</h3>' +

                        '<p><strong>' +
                            bookingEscape(
                                item.flight
                            ) +
                        '</strong></p>' +

                        '<div class="travel-route">' +

                            '<span>' +

                                bookingEscape(
                                    item.departure
                                ) +

                                '<small>' +

                                    bookingEscape(
                                        item.from
                                    ) +

                                '</small>' +

                            '</span>' +

                            '<span>→</span>' +

                            '<span>' +

                                bookingEscape(
                                    item.arrival
                                ) +

                                '<small>' +

                                    bookingEscape(
                                        item.to
                                    ) +

                                '</small>' +

                            '</span>' +

                        '</div>' +

                        '<p>⏱ ' +

                            bookingEscape(
                                item.duration
                            ) +

                            ' • ' +

                            bookingEscape(
                                item.stops
                            ) +

                        '</p>' +

                        '<p>🧳 Cabin baggage information available</p>';
                }


                /* =========================
                   HOTELS
                   ========================= */

                else if (
                    service ===
                    "hotels"
                ) {

                    html +=

                        '<h3>🏨 ' +

                            bookingEscape(
                                item.name
                            ) +

                        '</h3>' +

                        '<p>📍 ' +

                            bookingEscape(
                                item.location
                            ) +

                        '</p>' +

                        '<p>⭐ ' +

                            bookingEscape(
                                item.rating
                            ) +

                            '/5' +

                        '</p>';
                }


                /* =========================
                   TRAINS
                   ========================= */

                else if (
                    service ===
                    "trains"
                ) {

                    html +=

                        '<h3>🚆 ' +

                            bookingEscape(
                                item.name
                            ) +

                        '</h3>' +

                        '<p>Train No: ' +

                            bookingEscape(
                                item.number
                            ) +

                        '</p>' +

                        '<p>' +

                            bookingEscape(
                                item.departure
                            ) +

                            ' → ' +

                            bookingEscape(
                                item.arrival
                            ) +

                        '</p>' +

                        '<p>⏱ ' +

                            bookingEscape(
                                item.duration
                            ) +

                        '</p>';
                }


                /* =========================
                   BUSES
                   ========================= */

                else if (
                    service ===
                    "buses"
                ) {

                    html +=

                        '<h3>🚌 ' +

                            bookingEscape(
                                item.operator
                            ) +

                        '</h3>' +

                        '<p>' +

                            bookingEscape(
                                item.departure
                            ) +

                            ' → ' +

                            bookingEscape(
                                item.arrival
                            ) +

                        '</p>' +

                        '<p>⏱ ' +

                            bookingEscape(
                                item.duration
                            ) +

                        '</p>';
                }


                /* =========================
                   CABS
                   ========================= */

                else if (
                    service ===
                    "cabs"
                ) {

                    html +=

                        '<h3>🚕 ' +

                            bookingEscape(
                                item.provider
                            ) +

                        '</h3>' +

                        '<p>' +

                            bookingEscape(
                                item.vehicle
                            ) +

                            ' • Up to ' +

                            bookingEscape(
                                item.passengers
                            ) +

                            ' passengers' +

                        '</p>';
                }


                /* =========================
                   HOLIDAYS
                   ========================= */

                else if (
                    service ===
                    "holidays"
                ) {

                    html +=

                        '<h3>🌴 ' +

                            bookingEscape(
                                item.name
                            ) +

                        '</h3>' +

                        '<p>⏱ ' +

                            bookingEscape(
                                item.duration
                            ) +

                        '</p>';
                }


                /* =========================
                   PRICE
                   ========================= */

                html +=

                    '<div class="travel-price">' +

                        bookingMoney(
                            item.price
                        ) +

                        (
                            service ===
                            "hotels"

                            ? " / night"

                            : ""
                        ) +

                    '</div>';


                /* =========================
                   SELECT BUTTON
                   ========================= */

                html +=

                    '<button ' +

                        'type="button" ' +

                        'class="travel-select-btn" ' +

                        'data-booking-service="' +

                            bookingEscape(
                                service
                            ) +

                        '" ' +

                        'data-booking-index="' +

                            index +

                        '">' +

                        'Select' +

                    '</button>';


                html +=
                    '</div>';
            }
        );


        box.innerHTML =
            html;


        box.scrollIntoView(
            {
                behavior:
                    "smooth",

                block:
                    "start"
            }
        );
    }


    /* =====================================================
       THIS FIXES YOUR MAIN PROBLEM
       HTML CALLS:

       onclick="searchTravelService('flights')"
       ===================================================== */

    window.searchTravelService =
        function (
            service
        ) {

            service =
                String(
                    service ||
                    ""
                )
                .toLowerCase();


            console.log(
                "Searching:",
                service
            );


            if (
                !bookingData[
                    service
                ]
            ) {

                console.error(
                    "Unknown booking service:",
                    service
                );

                return;
            }


            renderBookingResults(
                service
            );
        };


    /* =====================================================
       BOOKING TABS
       ===================================================== */

    function activateBookingTab(
        service
    ) {

        document
            .querySelectorAll(
                ".travel-tab"
            )
            .forEach(
                function (
                    tab
                ) {

                    var active =
                        tab.getAttribute(
                            "data-service"
                        ) ===
                        service;


                    tab.classList.toggle(
                        "active",
                        active
                    );
                }
            );


        document
            .querySelectorAll(
                ".travel-form"
            )
            .forEach(
                function (
                    form
                ) {

                    var active =
                        form.getAttribute(
                            "data-service"
                        ) ===
                        service;


                    form.classList.toggle(
                        "active",
                        active
                    );


                    form.style.display =
                        active
                            ? ""
                            : "none";
                }
            );
    }


    /* =====================================================
       CLICK HANDLER
       ===================================================== */

    document.addEventListener(
        "click",
        function (
            event
        ) {

            /* -------------------------
               TAB CLICK
               ------------------------- */

            var tab =
                event.target.closest(
                    ".travel-tab"
                );


            if (tab) {

                event.preventDefault();


                var service =
                    tab.getAttribute(
                        "data-service"
                    );


                if (service) {

                    activateBookingTab(
                        service
                    );
                }


                return;
            }


            /* -------------------------
               SELECT BUTTON
               ------------------------- */

            var select =
                event.target.closest(
                    ".travel-select-btn"
                );


            if (select) {

                event.preventDefault();


                var selectedService =
                    select.getAttribute(
                        "data-booking-service"
                    );


                var index =
                    Number(
                        select.getAttribute(
                            "data-booking-index"
                        )
                    );


                var item =
                    bookingData[
                        selectedService
                    ] &&
                    bookingData[
                        selectedService
                    ][index];


                if (!item) {

                    return;
                }


                alert(

                    "Selected " +

                    selectedService +

                    " option.\n\nPrice: " +

                    bookingMoney(
                        item.price
                    ) +

                    "\n\nDemo booking selection completed."

                );
            }
        }
    );


    /* =====================================================
       INITIALIZE
       ===================================================== */

    document.addEventListener(
        "DOMContentLoaded",
        function () {

            var active =
                document.querySelector(
                    ".travel-tab.active"
                );


            if (active) {

                activateBookingTab(

                    active.getAttribute(
                        "data-service"
                    ) ||

                    "flights"

                );
            }


            console.log(
                "U Map booking system ready"
            );
        }
    );

})(); 
