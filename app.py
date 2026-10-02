import os
import math 
import json
import re
import requests 
import datetime

from google import genai
from google.genai import types

from flask import Flask, request, jsonify, render_template, Response, stream_with_context

from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# =========================================================
# API KEY
# =========================================================

SERPAPI_KEY = os.getenv("SERPAPI_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Use Google's native GenAI SDK. This avoids the OpenAI-compatible
# compatibility layer and lets the chatbot use native streaming.
gemini_client = None

if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(
            api_key=GEMINI_API_KEY
        )
    except Exception as error:
        print("GEMINI CLIENT ERROR:", error)
        gemini_client = None


# =========================================================
# TRANSPORT SETTINGS
# These are estimates, not live fares.
# =========================================================

TRANSPORTS = {
    "walking": {
        "label": "Walking",
        "icon": "🚶",
        "speed": 5,
        "base_cost": 0,
        "cost_per_km": 0
    },

    "bicycle": {
        "label": "Bicycle",
        "icon": "🚲",
        "speed": 15,
        "base_cost": 0,
        "cost_per_km": 0
    },

    "bike": {
        "label": "Bike",
        "icon": "🏍️",
        "speed": 35,
        "base_cost": 10,
        "cost_per_km": 3
    },

    "auto": {
        "label": "Auto",
        "icon": "🛺",
        "speed": 25,
        "base_cost": 30,
        "cost_per_km": 12
    },

    "taxi": {
        "label": "Taxi / Cab",
        "icon": "🚕",
        "speed": 30,
        "base_cost": 50,
        "cost_per_km": 18
    },

    "car": {
        "label": "Car",
        "icon": "🚗",
        "speed": 30,
        "base_cost": 0,
        "cost_per_km": 8
    },

    "bus": {
        "label": "Bus",
        "icon": "🚌",
        "speed": 22,
        "base_cost": 10,
        "cost_per_km": 2
    },

    "metro": {
        "label": "Train / Metro",
        "icon": "🚆",
        "speed": 35,
        "base_cost": 10,
        "cost_per_km": 2
    },

    "van": {
        "label": "Van",
        "icon": "🚐",
        "speed": 28,
        "base_cost": 40,
        "cost_per_km": 12
    },

    "flight": {
        "label": "Flight / Aeroplane",
        "icon": "✈️",
        "speed": 700,
        "base_cost": 2500,
        "cost_per_km": 5
    }
}


# =========================================================
# HOME
# =========================================================

@app.route("/")
def home():
    return render_template("index.html")


# =========================================================
# HEALTH CHECK
# =========================================================

@app.route("/api/health")
def health():

    return jsonify({
        "success": True,
        "message": "NaviSphere AI backend is running",
        "serpapi_configured": bool(SERPAPI_KEY),
        "gemini_configured": bool(GEMINI_API_KEY),
        "openai": "disabled"
    })


# =========================================================
# GEOCODING
# OpenStreetMap Nominatim
# =========================================================

def geocode_location(location):
    if not location:
        return None

    # 1. Try OpenStreetMap Nominatim
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": location,
                "format": "json",
                "limit": 1
            },
            headers={
                "User-Agent": "NaviSphereAI/1.0"
            },
            timeout=8
        )
        if response.status_code == 200:
            results = response.json()
            if results and len(results) > 0:
                return {
                    "lat": float(results[0]["lat"]),
                    "lng": float(results[0]["lon"]),
                    "display_name": results[0].get(
                        "display_name",
                        location
                    )
                }
    except Exception:
        pass

    # 2. Global Fallback: SerpApi Google Maps search for any worldwide place/landmark
    if SERPAPI_KEY:
        try:
            resp = requests.get(
                "https://serpapi.com/search.json",
                params={
                    "engine": "google_maps",
                    "type": "search",
                    "q": location,
                    "api_key": SERPAPI_KEY
                },
                timeout=12
            )
            if resp.status_code == 200:
                data = resp.json()
                pr = data.get("place_results")
                if isinstance(pr, dict) and pr.get("gps_coordinates"):
                    gps = pr["gps_coordinates"]
                    return {
                        "lat": float(gps["latitude"]),
                        "lng": float(gps["longitude"]),
                        "display_name": pr.get("title") or pr.get("address") or location
                    }
                lr = data.get("local_results", [])
                if lr and isinstance(lr, list) and isinstance(lr[0], dict) and lr[0].get("gps_coordinates"):
                    gps = lr[0]["gps_coordinates"]
                    return {
                        "lat": float(gps["latitude"]),
                        "lng": float(gps["longitude"]),
                        "display_name": lr[0].get("title") or lr[0].get("address") or location
                    }
        except Exception:
            pass

    return None


# =========================================================
# HAVERSINE DISTANCE
# =========================================================

def haversine_distance(
    lat1,
    lon1,
    lat2,
    lon2
):

    earth_radius = 6371

    lat1 = math.radians(lat1)
    lon1 = math.radians(lon1)

    lat2 = math.radians(lat2)
    lon2 = math.radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2) ** 2
        +
        math.cos(lat1)
        *
        math.cos(lat2)
        *
        math.sin(dlon / 2) ** 2
    )

    return (
        earth_radius
        *
        2
        *
        math.atan2(
            math.sqrt(a),
            math.sqrt(1 - a)
        )
    )


# =========================================================
# REAL ROAD ROUTE (OSRM)
# =========================================================

def get_driving_route(start, end):
    if not start or not end:
        return []
    url = (
        "https://router.project-osrm.org/"
        "route/v1/driving/"
        f"{start['lng']},{start['lat']};"
        f"{end['lng']},{end['lat']}"
    )
    try:
        response = requests.get(
            url,
            params={
                "alternatives": "true",
                "steps": "false",
                "overview": "false"
            },
            headers={"User-Agent": "NaviSphereAI/1.0"},
            timeout=12
        )
        if response.status_code != 200:
            return []
        data = response.json()
        if data.get("code") != "Ok":
            return []
        return data.get("routes", [])
    except Exception:
        return []


# =========================================================
# REAL WALKING ROUTE (OSRM Foot)
# =========================================================

def get_walking_route(start, end):
    if not start or not end:
        return []
    url = (
        "https://router.project-osrm.org/"
        "route/v1/foot/"
        f"{start['lng']},{start['lat']};"
        f"{end['lng']},{end['lat']}"
    )
    try:
        response = requests.get(
            url,
            params={
                "alternatives": "false",
                "steps": "false",
                "overview": "false"
            },
            headers={"User-Agent": "NaviSphereAI/1.0"},
            timeout=12
        )
        if response.status_code != 200:
            return []
        data = response.json()
        if data.get("code") != "Ok":
            return []
        return data.get("routes", [])
    except Exception:
        return []


# =========================================================
# NEARBY POI / TERMINALS SEARCH (Nominatim)
# =========================================================

def search_nearby_poi(query, limit=1):
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": query,
                "format": "json",
                "limit": limit
            },
            headers={"User-Agent": "NaviSphereAI/1.0"},
            timeout=6
        )
        if response.status_code == 200:
            return response.json()
    except Exception:
        pass
    return []


def format_minutes(minutes):
    if minutes is None:
        return "Data unavailable"
    total = int(round(minutes))
    hours, mins = divmod(total, 60)
    if hours > 0 and mins > 0:
        return f"{hours}h {mins}m"
    if hours > 0:
        return f"{hours}h"
    return f"{mins}m"


# =========================================================
# TRANSPORT CALCULATION (Helper)
# =========================================================

def calculate_transport(
    distance_km,
    mode,
    driving_minutes=None
):
    mode_key = str(mode or "").strip().lower()
    if mode_key in ("cab", "taxi / cab"):
        mode_key = "taxi"
    elif mode_key in ("railway", "train / railway", "metro"):
        mode_key = "train"
    elif mode_key in ("aeroplane", "flight / aeroplane", "plane"):
        mode_key = "flight"

    labels = {
        "walking": ("Walking", "🚶"),
        "van": ("Van", "🚐"),
        "taxi": ("Taxi / Cab", "🚕"),
        "bus": ("Bus", "🚌"),
        "train": ("Train / Railway", "🚆"),
        "flight": ("Flight / Aeroplane", "✈️")
    }

    label, icon = labels.get(mode_key, (mode_key.title(), "🚗"))

    if mode_key == "walking":
        dur = max(1, round((distance_km / 5.0) * 60))
        return {
            "mode": mode_key,
            "label": label,
            "icon": icon,
            "distance_km": round(distance_km, 2),
            "duration_minutes": dur,
            "duration_display": format_minutes(dur),
            "estimated_cost": 0,
            "cost_display": "₹0 (Free)",
            "cost_type": "exact",
            "price_status": "Exact price",
            "stops": "None",
            "notes": "Pedestrian route"
        }
    elif mode_key in ("taxi", "van"):
        dur = max(1, round(driving_minutes)) if driving_minutes else max(1, round((distance_km / 45.0) * 60))
        fare_text = "Van fare unavailable from the configured API" if mode_key == "van" else "Taxi fare unavailable from the configured API"
        return {
            "mode": mode_key,
            "label": label,
            "icon": icon,
            "distance_km": round(distance_km, 2),
            "duration_minutes": dur,
            "duration_display": format_minutes(dur),
            "estimated_cost": None,
            "cost_display": fare_text,
            "cost_type": "unavailable",
            "price_status": "Price unavailable",
            "stops": "Direct",
            "notes": "Real road network route"
        }
    elif mode_key == "bus":
        dur = max(1, round((driving_minutes or (distance_km / 35.0) * 60) * 1.3))
        return {
            "mode": mode_key,
            "label": label,
            "icon": icon,
            "distance_km": round(distance_km, 2),
            "duration_minutes": dur,
            "duration_display": format_minutes(dur),
            "estimated_cost": None,
            "cost_display": "Live bus information is not available from the configured API",
            "cost_type": "unavailable",
            "price_status": "Price unavailable",
            "stops": "Data unavailable",
            "notes": "Live schedule & fare unavailable from configured API"
        }
    elif mode_key == "train":
        return {
            "mode": mode_key,
            "label": label,
            "icon": icon,
            "distance_km": round(distance_km, 2),
            "duration_minutes": None,
            "duration_display": "Data unavailable",
            "estimated_cost": None,
            "cost_display": "Live train information is not available from the configured API.",
            "cost_type": "unavailable",
            "price_status": "Price unavailable",
            "stops": "Data unavailable",
            "notes": "Live train information is not available from the configured API."
        }
    elif mode_key == "flight":
        dur = max(45, round((distance_km / 700.0) * 60 + 30))
        return {
            "mode": mode_key,
            "label": label,
            "icon": icon,
            "distance_km": round(distance_km, 2),
            "duration_minutes": dur,
            "duration_display": format_minutes(dur),
            "estimated_cost": None,
            "cost_display": "Flight search available via Flight tab",
            "cost_type": "unavailable",
            "price_status": "Price unavailable",
            "stops": "Direct / 1 stop",
            "notes": "Aerial flight route"
        }

    dur = max(1, round(driving_minutes or ((distance_km / 40.0) * 60)))
    return {
        "mode": mode_key,
        "label": label,
        "icon": icon,
        "distance_km": round(distance_km, 2),
        "duration_minutes": dur,
        "duration_display": format_minutes(dur),
        "estimated_cost": None,
        "cost_display": "Fare unavailable from the configured API",
        "cost_type": "unavailable",
        "price_status": "Price unavailable",
        "stops": "Data unavailable",
        "notes": "Route calculated"
    }


# =========================================================
# SMART JOURNEY PLANNER (/api/journey-plan)
# =========================================================

@app.route(
    "/api/journey-plan",
    methods=["POST"]
)
def journey_plan():
    try:
        data = request.get_json(silent=True) or {}

        from_location = str(data.get("from", "")).strip()
        to_location = str(data.get("to", "")).strip()
        raw_mode = str(data.get("mode", "walking")).strip().lower()
        reach_by = data.get("reach_by")

        try:
            budget = float(data.get("budget", 0))
        except (TypeError, ValueError):
            return jsonify({
                "success": False,
                "error": "Please enter a valid budget."
            }), 400

        # Validation
        if not from_location:
            return jsonify({
                "success": False,
                "error": "Please enter your starting location."
            }), 400

        if not to_location:
            return jsonify({
                "success": False,
                "error": "Please enter your destination."
            }), 400

        if not math.isfinite(budget) or budget < 0:
            return jsonify({
                "success": False,
                "error": "Please enter a valid budget."
            }), 400

        # Normalize mode
        mode_map = {
            "walking": "walking",
            "walk": "walking",
            "van": "van",
            "taxi": "taxi",
            "cab": "taxi",
            "taxi / cab": "taxi",
            "bus": "bus",
            "train": "train",
            "railway": "train",
            "train / railway": "train",
            "metro": "train",
            "flight": "flight",
            "aeroplane": "flight",
            "flight / aeroplane": "flight"
        }
        mode = mode_map.get(raw_mode, "taxi")

        # Geocode start
        start = geocode_location(from_location)
        if not start:
            return jsonify({
                "success": False,
                "error": "Location could not be found. Please check the location name."
            }), 400

        # Geocode destination
        destination = geocode_location(to_location)
        if not destination:
            return jsonify({
                "success": False,
                "error": "Location could not be found. Please check the location name."
            }), 400

        # Check if same
        if (
            abs(start["lat"] - destination["lat"]) < 0.0001
            and abs(start["lng"] - destination["lng"]) < 0.0001
        ):
            return jsonify({
                "success": False,
                "error": "Starting point and destination cannot be the same. Please choose two different locations."
            }), 400

        # Base calculations
        straight_km = round(
            haversine_distance(
                start["lat"],
                start["lng"],
                destination["lat"],
                destination["lng"]
            ),
            2
        )

        # Road route from OSRM
        road_routes = get_driving_route(start, destination)
        road_distance_km = None
        road_duration_minutes = None

        if road_routes:
            road_distance_km = round(road_routes[0]["distance"] / 1000, 2)
            road_duration_minutes = round(road_routes[0]["duration"] / 60)
        else:
            road_distance_km = round(straight_km * 1.25, 2)
            road_duration_minutes = None

        # Walking route from OSRM foot routing
        walk_distance_km = None
        walk_duration_minutes = None
        walk_route_notes = ""
        if straight_km <= 120:
            foot_routes = get_walking_route(start, destination)
            if foot_routes:
                walk_distance_km = round(foot_routes[0]["distance"] / 1000, 1)
                walk_duration_minutes = max(1, round(foot_routes[0]["duration"] / 60))
                walk_route_notes = "Pedestrian route calculated via OpenStreetMap foot network."
            elif road_distance_km and road_distance_km <= 50:
                walk_distance_km = road_distance_km
                walk_duration_minutes = max(1, round((walk_distance_km / 4.8) * 60))
                walk_route_notes = "Walking route estimated along road corridor."
            else:
                walk_route_notes = "Pedestrian route unavailable for this distance or terrain from the configured routing service."
        else:
            walk_route_notes = "Pedestrian route not feasible for this distance from the configured routing service."

        # Selected mode details
        selected_cost = None
        cost_display = ""
        cost_type = "unavailable"
        price_status = "Price unavailable"
        selected_distance = road_distance_km
        selected_duration = road_duration_minutes
        route_notes = ""
        nearby_info = None

        if mode == "walking":
            selected_distance = walk_distance_km
            selected_duration = walk_duration_minutes
            if walk_distance_km is not None:
                selected_cost = 0
                cost_display = "₹0 (Free)"
                cost_type = "exact"
                price_status = "Exact price"
                route_notes = walk_route_notes
            else:
                selected_cost = None
                cost_display = "Data unavailable"
                cost_type = "unavailable"
                price_status = "Price unavailable"
                route_notes = walk_route_notes

        elif mode == "taxi":
            selected_distance = road_distance_km
            selected_duration = road_duration_minutes
            selected_cost = None
            cost_display = "Taxi fare unavailable from the configured API"
            cost_type = "unavailable"
            price_status = "Price unavailable"
            route_notes = "Distance and driving duration calculated from the OpenStreetMap road network."
            # Search nearby taxi stand
            t_stand = search_nearby_poi(f"taxi stand near {from_location}", limit=1)
            if t_stand:
                nearby_info = f"Nearby taxi service: {t_stand[0].get('display_name', '').split(',')[0]}"

        elif mode == "van":
            selected_distance = road_distance_km
            selected_duration = road_duration_minutes
            selected_cost = None
            cost_display = "Van fare unavailable from the configured API"
            cost_type = "unavailable"
            price_status = "Price unavailable"
            route_notes = "Van road route calculated from OpenStreetMap road network."

        elif mode == "bus":
            selected_distance = road_distance_km
            selected_duration = (
                round(road_duration_minutes * 1.35)
                if road_duration_minutes
                else round((road_distance_km / 30.0) * 60)
            )
            selected_cost = None
            cost_display = "Live bus information is not available from the configured API"
            cost_type = "unavailable"
            price_status = "Price unavailable"
            route_notes = "Road distance via OSRM. Live bus schedules, routes, and fares are not available from the configured API."
            # Search nearby bus terminal
            b_stop = search_nearby_poi(f"bus station near {from_location}", limit=1)
            if b_stop:
                nearby_info = f"Nearby bus station: {b_stop[0].get('display_name', '').split(',')[0]}"

        elif mode == "train":
            selected_distance = straight_km
            selected_duration = None
            selected_cost = None
            cost_display = "Live train information is not available from the configured API."
            cost_type = "unavailable"
            price_status = "Price unavailable"
            route_notes = "Live train information is not available from the configured API. No fabricated train data is displayed."
            # Search nearby railway station
            r_station = search_nearby_poi(f"railway station near {from_location}", limit=1)
            if r_station:
                nearby_info = f"Departure station identified: {r_station[0].get('display_name', '').split(',')[0]}"

        elif mode == "flight":
            selected_distance = straight_km
            selected_duration = max(45, round((straight_km / 750.0) * 60 + 30))
            if not SERPAPI_KEY:
                selected_cost = None
                cost_display = "Flight search configuration missing (SERPAPI_KEY is not configured)"
                cost_type = "unavailable"
                price_status = "Price unavailable"
                route_notes = "Flight search requires SERPAPI_KEY in server environment. Fake flight prices are never displayed."
            else:
                # Query Google Flights
                try:
                    dep_code = get_flight_location_id(from_location)
                    arr_code = get_flight_location_id(to_location)
                    if dep_code and arr_code and str(dep_code).upper() != str(arr_code).upper():
                        tomorrow = (
                            datetime.date.today() + datetime.timedelta(days=7)
                        ).strftime("%Y-%m-%d")
                        f_resp = requests.get(
                            "https://serpapi.com/search.json",
                            params={
                                "engine": "google_flights",
                                "departure_id": dep_code,
                                "arrival_id": arr_code,
                                "outbound_date": tomorrow,
                                "type": "2",
                                "currency": "INR",
                                "hl": "en",
                                "gl": "in",
                                "api_key": SERPAPI_KEY
                            },
                            timeout=15
                        )
                        if f_resp.status_code == 200:
                            f_data = f_resp.json()
                            raw_f = (
                                f_data.get("best_flights", [])
                                + f_data.get("other_flights", [])
                            )
                            prices = [
                                opt["price"]
                                for opt in raw_f
                                if isinstance(opt, dict) and opt.get("price") is not None
                            ]
                            if prices:
                                min_price = min(prices)
                                selected_cost = min_price
                                cost_display = f"₹{min_price:,}"
                                cost_type = "exact"
                                price_status = "Exact price"
                                route_notes = f"Real flight fare retrieved from Google Flights (lowest fare: ₹{min_price:,})."
                            else:
                                cost_display = "No live flight fares found from the configured API"
                                cost_type = "unavailable"
                                price_status = "Price unavailable"
                                route_notes = "Air route identified; live flight fares unavailable for selected dates."
                        else:
                            cost_display = "Flight fare unavailable from configured API"
                            cost_type = "unavailable"
                            price_status = "Price unavailable"
                            route_notes = "Flight service returned a non-200 response."
                    else:
                        cost_display = "Airport code could not be resolved from configured API"
                        cost_type = "unavailable"
                        price_status = "Price unavailable"
                        route_notes = "Could not resolve airport code for flight search."
                except Exception as ex:
                    cost_display = "Flight search service unavailable"
                    cost_type = "unavailable"
                    price_status = "Price unavailable"
                    route_notes = f"Flight search could not be completed: {str(ex)}"

        # Budget calculation
        remaining = None
        within_budget = None
        budget_message = ""

        if selected_cost is not None and cost_type == "exact":
            remaining = round(budget - selected_cost)
            within_budget = (remaining >= 0)
            if within_budget:
                budget_message = (
                    f"This journey fits within your budget of ₹{budget:,.0f}. "
                    f"You have ₹{remaining:,.0f} remaining."
                )
            else:
                budget_message = (
                    f"This journey is ₹{abs(remaining):,.0f} above your selected budget of ₹{budget:,.0f}."
                )
        else:
            budget_message = (
                f"{cost_display}. Distance and duration are based on real route data."
            )

        # Build full multi-mode comparison list
        modes_to_compare = [
            ("walking", "Walking", "🚶", walk_distance_km, walk_duration_minutes),
            ("van", "Van", "🚐", road_distance_km, road_duration_minutes),
            ("taxi", "Taxi / Cab", "🚕", road_distance_km, road_duration_minutes),
            ("bus", "Bus", "🚌", road_distance_km, round(road_duration_minutes * 1.35) if road_duration_minutes else None),
            ("train", "Train / Railway", "🚆", straight_km, None),
            ("flight", "Flight / Aeroplane", "✈️", straight_km, max(45, round((straight_km / 750.0) * 60 + 30)))
        ]

        comparison = []
        for m_key, m_label, m_icon, m_dist, m_dur in modes_to_compare:
            if m_key == "walking":
                if walk_distance_km is not None:
                    m_cost = 0
                    m_cost_disp = "₹0 (Free)"
                    m_cost_type = "exact"
                    m_within = True
                    m_note = "Pedestrian route"
                    m_stops = "None"
                else:
                    m_cost = None
                    m_cost_disp = "Data unavailable"
                    m_cost_type = "unavailable"
                    m_within = None
                    m_note = "Pedestrian route unavailable for this distance/terrain"
                    m_stops = "Data unavailable"
            elif m_key == "taxi":
                m_cost = None
                m_cost_disp = "Taxi fare unavailable from the configured API"
                m_cost_type = "unavailable"
                m_within = None
                m_note = "Real road route"
                m_stops = "Direct"
            elif m_key == "van":
                m_cost = None
                m_cost_disp = "Van fare unavailable from the configured API"
                m_cost_type = "unavailable"
                m_within = None
                m_note = "Van road route"
                m_stops = "Direct"
            elif m_key == "bus":
                m_cost = None
                m_cost_disp = "Data unavailable"
                m_cost_type = "unavailable"
                m_within = None
                m_note = "Live bus schedule and fare unavailable"
                m_stops = "Data unavailable"
            elif m_key == "train":
                m_cost = None
                m_cost_disp = "Data unavailable"
                m_cost_type = "unavailable"
                m_within = None
                m_note = "Live train information is not available from the configured API."
                m_stops = "Data unavailable"
            elif m_key == "flight":
                if mode == "flight" and selected_cost is not None:
                    m_cost = selected_cost
                    m_cost_disp = f"₹{selected_cost:,}"
                    m_cost_type = "exact"
                    m_within = (selected_cost <= budget)
                else:
                    m_cost = None
                    m_cost_disp = "Data unavailable"
                    m_cost_type = "unavailable"
                    m_within = None
                m_note = "Aerial route"
                m_stops = "Direct / 1 stop"

            comparison.append({
                "mode": m_key,
                "label": m_label,
                "icon": m_icon,
                "distance_km": m_dist,
                "distance_display": f"{m_dist:.1f} km" if m_dist is not None else "Data unavailable",
                "duration_minutes": m_dur,
                "duration_display": format_minutes(m_dur),
                "estimated_cost": m_cost,
                "cost_display": m_cost_disp,
                "cost_type": m_cost_type,
                "stops": m_stops,
                "notes": m_note,
                "within_budget": m_within
            })

        # Alternatives that fit budget (other modes)
        alternatives = [
            item for item in comparison
            if item["mode"] != mode and item["within_budget"] is True
        ]

        labels_dict = {
            "walking": ("Walking", "🚶"),
            "van": ("Van", "🚐"),
            "taxi": ("Taxi / Cab", "🚕"),
            "bus": ("Bus", "🚌"),
            "train": ("Train / Railway", "🚆"),
            "flight": ("Flight / Aeroplane", "✈️")
        }
        sel_label, sel_icon = labels_dict.get(mode, (mode.title(), "🚗"))

        return jsonify({
            "success": True,
            "from": start["display_name"],
            "to": destination["display_name"],
            "mode": mode,
            "mode_label": sel_label,
            "icon": sel_icon,
            "distance_km": selected_distance,
            "duration_minutes": selected_duration,
            "duration_display": format_minutes(selected_duration),
            "estimated_cost": selected_cost,
            "cost_display": cost_display,
            "cost_type": cost_type,
            "price_status": price_status,
            "budget": round(budget),
            "remaining": remaining,
            "within_budget": within_budget,
            "budget_message": budget_message,
            "route_notes": route_notes,
            "nearby_info": nearby_info,
            "comparison": comparison,
            "alternatives": alternatives,
            "reach_by": reach_by,
            "note": "Distance and duration use real routing and geocoding services. Fares are shown only when genuinely available from configured APIs."
        })

    except Exception as error:
        print("JOURNEY PLAN ERROR:", error)
        return jsonify({
            "success": False,
            "error": "An error occurred while planning this journey. Please verify your locations and try again."
        }), 500


# =========================================================
# COMPARE YOUR JOURNEY / ROUTES (/api/directions)
# =========================================================

@app.route(
    "/api/directions",
    methods=["GET"]
)
def directions():
    try:
        start_text = request.args.get("start", "").strip()
        end_text = request.args.get("end", "").strip()

        if not start_text or not end_text:
            return jsonify({
                "success": False,
                "error": "Please enter both starting point and destination."
            }), 400

        start = geocode_location(start_text)
        if not start:
            return jsonify({
                "success": False,
                "error": "Location could not be found. Please check the location name."
            }), 400

        end = geocode_location(end_text)
        if not end:
            return jsonify({
                "success": False,
                "error": "Location could not be found. Please check the location name."
            }), 400

        if (
            abs(start["lat"] - end["lat"]) < 0.0001
            and abs(start["lng"] - end["lng"]) < 0.0001
        ):
            return jsonify({
                "success": False,
                "error": "Starting point and destination cannot be the same."
            }), 400

        straight_km = round(
            haversine_distance(
                start["lat"],
                start["lng"],
                end["lat"],
                end["lng"]
            ),
            1
        )

        road_routes = get_driving_route(start, end)
        road_km = None
        road_duration_str = None
        road_dur_mins = None

        # Validate road route physically: Road distance can NEVER be less than 85% of straight-line distance
        # If straight_km > 300 and road_distance < straight_km * 0.85, OSRM snapped to another continent/island across oceans!
        if road_routes:
            calculated_road_km = round(road_routes[0]["distance"] / 1000, 1)
            if straight_km > 300 and calculated_road_km < straight_km * 0.85:
                road_routes = []
            else:
                road_km = calculated_road_km
                road_dur_mins = round(road_routes[0]["duration"] / 60)
                road_duration_str = format_minutes(road_dur_mins)

        # Foot route
        walk_km = None
        walk_dur_str = None
        if straight_km <= 50 and road_km:
            foot_routes = get_walking_route(start, end)
            if foot_routes:
                walk_km = round(foot_routes[0]["distance"] / 1000, 1)
                walk_dur_str = format_minutes(round(foot_routes[0]["duration"] / 60))
            elif road_km and road_km <= 35:
                walk_km = road_km
                walk_dur_str = format_minutes(round((walk_km / 4.8) * 60))

        bus_dur_str = None
        if road_dur_mins:
            bus_dur_str = format_minutes(round(road_dur_mins * 1.35))

        flight_dur_str = format_minutes(max(45, round((straight_km / 800.0) * 60 + 40)))

        # Build comparison table:
        # | Mode | Distance | Duration | Cost | Stops/Transfers | Notes |
        comparison = [
            {
                "mode": "Walking",
                "distance": f"{walk_km} km" if walk_km is not None else "Data unavailable",
                "duration": walk_dur_str if walk_dur_str else "Data unavailable",
                "cost": "₹0 (Free)" if walk_km is not None else "Data unavailable",
                "stops": "None" if walk_km is not None else "Data unavailable",
                "notes": "Pedestrian network route" if walk_km is not None else "Pedestrian route unavailable for this distance/terrain"
            },
            {
                "mode": "Taxi / Cab",
                "distance": f"{road_km} km" if road_km is not None else "Data unavailable",
                "duration": road_duration_str if road_duration_str else "Data unavailable",
                "cost": "Taxi fare unavailable from the configured API" if road_km is not None else "Data unavailable",
                "stops": "Direct" if road_km is not None else "Data unavailable",
                "notes": "Real road route" if road_km else "Road route unavailable (trans-oceanic / overseas destination)"
            },
            {
                "mode": "Van",
                "distance": f"{road_km} km" if road_km is not None else "Data unavailable",
                "duration": road_duration_str if road_duration_str else "Data unavailable",
                "cost": "Van fare unavailable from the configured API" if road_km is not None else "Data unavailable",
                "stops": "Direct" if road_km is not None else "Data unavailable",
                "notes": "Van road route" if road_km else "Road route unavailable (trans-oceanic / overseas destination)"
            },
            {
                "mode": "Bus",
                "distance": f"{road_km} km" if road_km is not None else "Data unavailable",
                "duration": bus_dur_str if bus_dur_str else "Data unavailable",
                "cost": "Data unavailable",
                "stops": "Data unavailable",
                "notes": "Live bus schedule and fare unavailable from configured API" if road_km else "Bus route unavailable (trans-oceanic / overseas destination)"
            },
            {
                "mode": "Train / Railway",
                "distance": f"{straight_km} km" if road_km is not None else "Data unavailable",
                "duration": "Data unavailable",
                "cost": "Data unavailable",
                "stops": "Data unavailable",
                "notes": "Live train information is not available from the configured API." if road_km is not None else "Direct rail network unavailable across oceans / long-distance terrain"
            },
            {
                "mode": "Flight",
                "distance": f"{straight_km:,.1f} km",
                "duration": flight_dur_str,
                "cost": "Data unavailable",
                "stops": "Direct" if straight_km < 3500 else "1-2 stops",
                "notes": "Air route (see Flight search for live fares)"
            }
        ]

        # Driving routes list for backward compatibility
        routes_list = []
        if road_routes:
            for index, route in enumerate(road_routes[:3], start=1):
                d_km = route["distance"] / 1000
                d_mins = round(route["duration"] / 60)
                routes_list.append({
                    "title": "Recommended Route" if index == 1 else f"Alternative Route {index - 1}",
                    "distance": f"{d_km:.2f} km",
                    "formatted_distance": f"{d_km:.2f} km",
                    "duration": format_minutes(d_mins),
                    "formatted_duration": format_minutes(d_mins),
                    "price": "Taxi fare unavailable from the configured API",
                    "estimated_cost": None
                })

        return jsonify({
            "success": True,
            "start": start["display_name"],
            "end": end["display_name"],
            "comparison": comparison,
            "routes": routes_list
        })

    except Exception as error:
        print("DIRECTIONS ERROR:", error)
        return jsonify({
            "success": False,
            "error": "Failed to calculate directions. Please check the locations and try again."
        }), 500


# =========================================================
# TRAVEL BOOKING API (/api/travel-booking)
# Handles trains, buses, cabs without fabricating fake data
# =========================================================

@app.route(
    "/api/travel-booking",
    methods=["GET", "POST"]
)
def travel_booking():
    try:
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
        else:
            data = request.args

        service = str(data.get("service", "")).strip().lower()
        from_loc = str(data.get("from", "")).strip()
        to_loc = str(data.get("to", "")).strip()
        vehicle = str(data.get("vehicle", "")).strip()

        if not from_loc or not to_loc:
            return jsonify({
                "success": False,
                "error": "Please enter both From and To locations."
            }), 400

        start = geocode_location(from_loc)
        if not start:
            return jsonify({
                "success": False,
                "error": "Location could not be found. Please check the location name."
            }), 400

        destination = geocode_location(to_loc)
        if not destination:
            return jsonify({
                "success": False,
                "error": "Location could not be found. Please check the location name."
            }), 400

        # Calculate road distance
        driving_routes = get_driving_route(start, destination)
        road_km = None
        road_dur_str = None
        if driving_routes:
            road_km = round(driving_routes[0]["distance"] / 1000, 1)
            road_dur_str = format_minutes(round(driving_routes[0]["duration"] / 60))

        straight_km = round(
            haversine_distance(start["lat"], start["lng"], destination["lat"], destination["lng"]),
            1
        )

        if service == "trains":
            from_st = search_nearby_poi(f"railway station near {from_loc}", limit=1)
            to_st = search_nearby_poi(f"railway station near {to_loc}", limit=1)
            from_st_name = from_st[0].get("display_name", from_loc) if from_st else from_loc
            to_st_name = to_st[0].get("display_name", to_loc) if to_st else to_loc

            return jsonify({
                "success": True,
                "service": "trains",
                "from": from_loc,
                "to": to_loc,
                "distance_km": road_km or straight_km,
                "departure_station": from_st_name.split(",")[0],
                "arrival_station": to_st_name.split(",")[0],
                "results": [
                    {
                        "title": f"{from_loc} → {to_loc}",
                        "subtitle": f"Station: {from_st_name.split(',')[0]} → {to_st_name.split(',')[0]}",
                        "time": f"Distance: {road_km or straight_km} km",
                        "duration": "Duration unavailable from configured API",
                        "price_display": "Live train information is not available from the configured API.",
                        "notes": "Live train information is not available from the configured API."
                    }
                ],
                "message": "Live train information is not available from the configured API."
            })

        elif service == "buses":
            from_term = search_nearby_poi(f"bus station near {from_loc}", limit=1)
            to_term = search_nearby_poi(f"bus station near {to_loc}", limit=1)
            from_t_name = from_term[0].get("display_name", f"{from_loc} Bus Stand") if from_term else f"{from_loc} Bus Stand"
            to_t_name = to_term[0].get("display_name", f"{to_loc} Bus Stand") if to_term else f"{to_loc} Bus Stand"

            bus_dur_str = road_dur_str
            if driving_routes:
                bus_dur_str = format_minutes(round((driving_routes[0]["duration"] / 60) * 1.35))

            return jsonify({
                "success": True,
                "service": "buses",
                "from": from_loc,
                "to": to_loc,
                "distance_km": road_km,
                "duration": bus_dur_str or "Data unavailable",
                "departure_terminal": from_t_name.split(",")[0],
                "arrival_terminal": to_t_name.split(",")[0],
                "results": [
                    {
                        "title": f"{from_loc} → {to_loc}",
                        "subtitle": f"Terminal: {from_t_name.split(',')[0]} → {to_t_name.split(',')[0]}",
                        "time": f"Distance: {road_km} km" if road_km else "Distance unavailable",
                        "duration": bus_dur_str or "Data unavailable",
                        "price_display": "Live bus information is not available from the configured API",
                        "notes": "Live bus schedules, routes, departure times, and fares are not available from the configured API."
                    }
                ],
                "message": "Live bus information is not available from the configured API."
            })

        elif service == "cabs":
            is_van = "van" in vehicle.lower() or "traveller" in vehicle.lower()
            veh_name = vehicle if vehicle else ("Van / Traveller" if is_van else "Taxi / Cab")
            fare_notice = (
                "Van fare unavailable from the configured API"
                if is_van
                else "Taxi fare unavailable from the configured API"
            )

            # Search nearby taxi stand
            t_stand = search_nearby_poi(f"taxi stand near {from_loc}", limit=1)
            nearby_note = f" (Nearby taxi service: {t_stand[0].get('display_name', '').split(',')[0]})" if t_stand else ""

            return jsonify({
                "success": True,
                "service": "cabs",
                "from": from_loc,
                "to": to_loc,
                "vehicle": veh_name,
                "distance_km": road_km,
                "duration": road_dur_str or "Data unavailable",
                "results": [
                    {
                        "title": f"{from_loc} → {to_loc}",
                        "subtitle": f"{veh_name} • Road Journey{nearby_note}",
                        "time": f"Distance: {road_km} km" if road_km else "Distance unavailable",
                        "duration": road_dur_str or "Data unavailable",
                        "price_display": fare_notice,
                        "notes": f"Real road distance and travel time calculated via OpenStreetMap. {fare_notice}."
                    }
                ],
                "message": fare_notice
            })

        return jsonify({
            "success": False,
            "error": f"Service '{service}' not recognized."
        }), 400

    except Exception as error:
        print("TRAVEL BOOKING ERROR:", error)
        return jsonify({
            "success": False,
            "error": "Failed to retrieve travel booking details."
        }), 500


# =========================================================
# SERPAPI LOCAL SEARCH
# =========================================================

@app.route(
    "/api/search",
    methods=["GET"]
)
def search_places():
    query = request.args.get(
        "q",
        ""
    ).strip()

    location = request.args.get(
        "location",
        ""
    ).strip()

    lat = request.args.get(
        "lat"
    )

    lng = request.args.get(
        "lng"
    )

    open_now = request.args.get(
        "open_now",
        "false"
    )

    # Determine optimal search query worldwide
    if query and location:
        if location.lower() in query.lower():
            search_query = query
        else:
            search_query = f"{query} in {location}"
    elif query:
        search_query = query
    elif location:
        search_query = f"attractions and places in {location}"
    else:
        search_query = "places near me"

    lower_query = search_query.lower()

    # Taxi / Cab
    is_taxi_search = (
        "taxi" in lower_query
        or
        "cab" in lower_query
    )

    if is_taxi_search and not location and (lat and lng):
        search_query = "taxi near me"

    if not SERPAPI_KEY:
        return jsonify({
            "success": False,
            "error": "SerpApi key is not configured."
        }), 500

    params = {
        "engine": "google_maps",
        "type": "search",
        "q": search_query,
        "api_key": SERPAPI_KEY
    }

    # -----------------------------
    # CURRENT LOCATION
    # -----------------------------
    if lat and lng:
        try:
            lat_value = float(lat)
            lng_value = float(lng)
            params["ll"] = f"@{lat_value},{lng_value},15z"
            if is_taxi_search:
                params["nearby"] = "true"
        except ValueError:
            return jsonify({
                "success": False,
                "error": "Invalid location coordinates."
            }), 400

    # -----------------------------
    # OPEN NOW
    # -----------------------------
    if str(open_now).lower() in ("true", "1"):
        params["open_state"] = "open"

    try:
        response = requests.get(
            "https://serpapi.com/search.json",
            params=params,
            timeout=20
        )
        response.raise_for_status()
        data = response.json()

        raw_places = []
        if isinstance(data.get("place_results"), dict):
            raw_places.append(data["place_results"])
        for place in data.get("local_results", []):
            if isinstance(place, dict):
                raw_places.append(place)

        # Fallback if 0 results and location or query provided without coordinates
        if not raw_places and not (lat and lng):
            target_loc = location or query
            geo = geocode_location(target_loc)
            if geo:
                params["ll"] = f"@{geo['lat']},{geo['lng']},14z"
                try:
                    fb_resp = requests.get(
                        "https://serpapi.com/search.json",
                        params=params,
                        timeout=15
                    )
                    if fb_resp.status_code == 200:
                        fb_data = fb_resp.json()
                        if isinstance(fb_data.get("place_results"), dict):
                            raw_places.append(fb_data["place_results"])
                        for place in fb_data.get("local_results", []):
                            if isinstance(place, dict):
                                raw_places.append(place)
                except Exception:
                    pass

        results = []
        for place in raw_places:
            gps = place.get("gps_coordinates") or {}
            latitude = gps.get("latitude")
            longitude = gps.get("longitude")

            p_type = place.get("type")
            if isinstance(p_type, list):
                type_str = ", ".join([str(t) for t in p_type if t])
            else:
                type_str = str(p_type) if p_type else "Place"

            # Check for legitimate virtual tour link
            # Never fabricate virtual tours
            virtual_tour = (
                place.get("virtual_tour")
                or place.get("inside_view")
                or place.get("virtual_tour_url")
                or None
            )

            results.append({
                "title": place.get("title") or place.get("name") or "",
                "rating": place.get("rating"),
                "reviews": place.get("reviews"),
                "price": convert_usd_to_inr_price(place.get("price")),
                "type": type_str,
                "address": place.get("address") or "Address unavailable",
                "phone": place.get("phone") or "",
                "open_state": place.get("open_state") or "",
                "hours": place.get("hours") or "",
                "thumbnail": place.get("thumbnail") or "",
                "data_id": place.get("data_id") or "",
                "place_id": place.get("place_id") or "",
                "latitude": latitude,
                "longitude": longitude,
                "website": place.get("website") or "",
                "directions": place.get("directions") or "",
                "street_view_url": (
                    f"https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={latitude},{longitude}"
                    if (latitude is not None and longitude is not None) else None
                ),
                "virtual_tour_url": virtual_tour,
                "satellite_url": (
                    f"https://www.google.com/maps/@?api=1&map_action=map&center={latitude},{longitude}&zoom=18&basemap=satellite"
                    if (latitude is not None and longitude is not None) else None
                )
            })

        coordinates = None
        if lat and lng:
            try:
                coordinates = {
                    "latitude": float(lat),
                    "longitude": float(lng)
                }
            except ValueError:
                pass
        elif results and results[0].get("latitude") is not None and results[0].get("longitude") is not None:
            coordinates = {
                "latitude": float(results[0]["latitude"]),
                "longitude": float(results[0]["longitude"])
            }

        return jsonify({
            "success": True,
            "query": search_query,
            "results": results,
            "coordinates": coordinates
        })

    except requests.RequestException as error:
        return jsonify({
            "success": False,
            "error": "Unable to connect to SerpApi.",
            "details": str(error)
        }), 502


# =========================================================
# REVIEWS
# =========================================================

@app.route(
    "/api/reviews",
    methods=["GET"]
)
def reviews():
    data_id = request.args.get(
        "data_id",
        ""
    ).strip()

    place_id = request.args.get(
        "place_id",
        ""
    ).strip()

    q = request.args.get(
        "q",
        ""
    ).strip()

    if not data_id and not place_id and not q:
        return jsonify({
            "success": False,
            "error": "Missing place or data ID."
        }), 400

    if not SERPAPI_KEY:
        return jsonify({
            "success": False,
            "error": "SerpApi key is not configured."
        }), 500

    try:
        rev_params = {
            "engine": "google_maps_reviews",
            "api_key": SERPAPI_KEY
        }
        if data_id:
            rev_params["data_id"] = data_id
        elif place_id:
            rev_params["place_id"] = place_id
        elif q:
            rev_params["q"] = q

        response = requests.get(
            "https://serpapi.com/search.json",
            params=rev_params,
            timeout=20
        )

        response.raise_for_status()
        data = response.json()

        place_info = data.get(
            "place_info",
            {}
        )

        if not isinstance(place_info, dict):
            place_info = {}

        raw_reviews = data.get(
            "reviews",
            []
        )

        normalized_reviews = []

        for review in raw_reviews:
            if not isinstance(review, dict):
                continue

            user = review.get(
                "user",
                {}
            )

            if not isinstance(user, dict):
                user = {}

            author_name = (
                user.get("name")
                or review.get("author")
                or review.get("author_name")
                or "Google user"
            )

            author_photo = (
                user.get("thumbnail")
                or user.get("photo")
                or review.get("profile_photo")
                or ""
            )

            author_link = (
                user.get("link")
                or review.get("author_link")
                or ""
            )

            text = (
                review.get("snippet")
                or review.get("text")
                or review.get("extracted_snippet", {}).get("original", "")
                if isinstance(review.get("extracted_snippet", {}), dict)
                else review.get("snippet") or review.get("text") or ""
            )

            normalized_reviews.append({
                "name": author_name,
                "photo": author_photo,
                "profile": author_link,
                "rating": review.get("rating", 0),
                "date": review.get("date", ""),
                "iso_date": review.get("iso_date", ""),
                "text": text or "No review text available.",
                "likes": review.get("likes", 0),
                "review_link": review.get("link", ""),
                "images": review.get("images", []),
                "response": review.get("response", {})
            })

        return jsonify({
            "success": True,
            "place": {
                "title": place_info.get("title", ""),
                "address": place_info.get("address", ""),
                "rating": place_info.get("rating", ""),
                "review_count": place_info.get("reviews", 0),
                "type": place_info.get("type", "")
            },
            "reviews": normalized_reviews
        })

    except requests.RequestException as error:
        return jsonify({
            "success": False,
            "error": "Unable to connect to SerpApi.",
            "details": str(error)
        }), 502

    except Exception as error:
        print("REVIEWS ERROR:", error)
        return jsonify({
            "success": False,
            "error": str(error)
        }), 502


# =========================================================
# LOCAL AI GUIDE
# NO OPENAI CREDITS REQUIRED
# =========================================================

def local_ai_guide(message):

    text = message.lower()


    if (
        "taxi" in text
        or
        "cab" in text
        or
        "uber" in text
        or
        "ola" in text
    ):

        return (
            "I can help you find nearby taxis. "
            "Use Explore with 'taxi near me' "
            "and allow your current location. "
            "NaviSphere searches nearby "
            "taxi/cab listings through SerpApi."
        )


    if (
        "food" in text
        or
        "restaurant" in text
        or
        "eat" in text
        or
        "cafe" in text
    ):

        return (
            "Use the Food section to search "
            "nearby restaurants and cafes. "
            "You can also enter a budget."
        )


    if (
        "route" in text
        or
        "direction" in text
        or
        "distance" in text
        or
        "travel" in text
    ):

        return (
            "Use Compare Your Journey to enter "
            "your starting point and destination. "
            "NaviSphere calculates road routes, "
            "distance and estimated travel time."
        )


    if (
        "hospital" in text
        or
        "medical" in text
    ):

        return (
            "Use the Hospitals quick-search "
            "option with location enabled "
            "to find nearby hospitals."
        )


    if (
        "pharmacy" in text
        or
        "medicine" in text
    ):

        return (
            "Use the Pharmacy quick-search "
            "option to find nearby pharmacies."
        )


    return (
        "I can help you find nearby services, "
        "compare routes, estimate travel costs "
        "and plan a journey based on your budget."
    )


# =========================================================
# NAVISPHERE AI - FAST GEMINI STREAMING CHAT
# =========================================================

# Fast, low-output model for responsive chat.
# The user sees the first generated chunks as soon as Gemini sends them.
GEMINI_MODEL = "gemini-3.5-flash-lite"

NAVISPHERE_SYSTEM_PROMPT = """
You are NaviSphere AI, a fast, friendly, general-purpose AI assistant
inside the NaviSphere website.

Answer the user's actual question directly. You can help with:
travel planning, destinations, routes, transport, taxis, restaurants,
budgets, local places, hotels, geography, general knowledge, education,
programming, technology, writing, calculations, planning, and everyday
questions.

Keep normal answers concise and useful. Start answering immediately.
Do not waste words repeating the question or saying you are thinking.

Never invent live location, price, opening hours, availability, distance,
route, weather, or business information. If NaviSphere has not supplied
live data, clearly say it is an estimate or that live data is unavailable.

You are NaviSphere AI.
"""


def convert_messages_to_gemini(messages):

    contents = []

    # Keep the conversation short enough for fast requests.
    for message in messages[-6:]:

        role = message.get("role")
        content = str(
            message.get("content", "")
        ).strip()

        if not content:
            continue

        if role == "user":
            gemini_role = "user"
        elif role == "assistant":
            gemini_role = "model"
        else:
            continue

        contents.append({
            "role": gemini_role,
            "parts": [
                {
                    "text": content
                }
            ]
        })

    return contents


@app.route("/api/ai-chat-stream", methods=["POST"])
def ai_chat_stream():

    if not GEMINI_API_KEY or not gemini_client:
        return jsonify({
            "success": False,
            "error": "Gemini API key is not configured."
        }), 503

    data = request.get_json(silent=True) or {}
    messages = data.get("messages", [])

    if not messages:
        return jsonify({
            "success": False,
            "error": "Please enter a message."
        }), 400

    contents = convert_messages_to_gemini(messages)

    if not contents:
        return jsonify({
            "success": False,
            "error": "No valid message was provided."
        }), 400

    def generate():

        try:

            config = types.GenerateContentConfig(
                system_instruction=NAVISPHERE_SYSTEM_PROMPT,
                temperature=0.3,
                max_output_tokens=350,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                )
            )

            stream = gemini_client.models.generate_content_stream(
                model=GEMINI_MODEL,
                contents=contents,
                config=config
            )

            for chunk in stream:

                text = getattr(chunk, "text", None)

                if not text:
                    continue

                yield (
                    "data: "
                    + json.dumps({"text": text})
                    + "\n\n"
                )

            yield (
                "data: "
                + json.dumps({"done": True})
                + "\n\n"
            )

        except Exception as error:

            error_text = str(error)
            print("GEMINI STREAM ERROR:", error_text)

            lower_error = error_text.lower()

            if "429" in error_text or "resource_exhausted" in lower_error or "quota" in lower_error:
                message = "Gemini free-tier usage limit was reached. Please try again later."
            elif "503" in error_text or "unavailable" in lower_error:
                message = "Gemini is temporarily busy. Please try again in a moment."
            else:
                message = "Gemini could not process the request."

            yield (
                "data: "
                + json.dumps({"error": message})
                + "\n\n"
            )

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )


# Keep the old endpoint working for any existing frontend code.
@app.route("/api/ai-chat", methods=["POST"])
def ai_chat():

    data = request.get_json(silent=True) or {}
    messages = data.get("messages", [])

    if not messages:
        return jsonify({
            "success": False,
            "error": "Please enter a message."
        }), 400

    if not GEMINI_API_KEY or not gemini_client:
        return jsonify({
            "success": False,
            "error": "Gemini API key is not configured."
        }), 503

    try:
        contents = convert_messages_to_gemini(messages)

        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=NAVISPHERE_SYSTEM_PROMPT,
                temperature=0.3,
                max_output_tokens=350,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                )
            )
        )

        return jsonify({
            "success": True,
            "reply": response.text or "I couldn't generate a response right now."
        })

    except Exception as error:
        print("GEMINI ERROR:", error)
        return jsonify({
            "success": False,
            "error": "Gemini could not process the request."
        }), 500


# =========================================================
# GEMINI LIVE VOICE ASSISTANT - EPHEMERAL TOKEN
# =========================================================

@app.route("/api/live-token", methods=["POST"])
def live_token():

    if not GEMINI_API_KEY:
        return jsonify({
            "success": False,
            "error": "Gemini API key is not configured."
        }), 503

    try:

        now = datetime.datetime.now(
            datetime.timezone.utc
        )

        client = genai.Client(
            api_key=GEMINI_API_KEY
        )

        token = client.auth_tokens.create(
            config={
                "uses": 1,
                "expire_time": now + datetime.timedelta(minutes=30),
                "new_session_expire_time": now + datetime.timedelta(minutes=1),
                "live_connect_constraints": {
                    "model": "gemini-3.8-live",
                    "config": {
                        "response_modalities": ["AUDIO"],
                        "system_instruction": {
                            "parts": [
                                {
                                    "text": """
You are NaviSphere AI, a friendly real-time voice assistant.
Help with travel, routes, transport, destinations, restaurants,
taxis, budgets, local places, and general questions.
Keep answers natural, short and useful.
Never invent live location, price, route or availability data.
"""
                                }
                            ]
                        }
                    }
                }
            }
        )

        return jsonify({
            "success": True,
            "token": token.name
        })

    except Exception as error:

        print("GEMINI LIVE TOKEN ERROR:", error)

        return jsonify({
            "success": False,
            "error": "Could not create voice session."
        }), 500
# =========================================================
# GOOGLE FLIGHTS SEARCH
# =========================================================

# =========================================================
# GOOGLE FLIGHTS SEARCH
# =========================================================

def get_flight_location_id(location):
    """
    Convert a city / airport name into a Google Flights
    departure_id / arrival_id using SerpApi autocomplete.

    Returns:
        Airport IATA code or Google location ID.
    """

    location = str(location or "").strip()

    if not location:
        return None

    # If the user already entered a 3-letter IATA code,
    # use it directly.
    if (
        len(location) == 3
        and location.isalpha()
    ):
        return location.upper()

    if not SERPAPI_KEY:
        return None

    try:

        response = requests.get(
            "https://serpapi.com/search.json",
            params={
                "engine": "google_flights_autocomplete",
                "q": location,
                "api_key": SERPAPI_KEY
            },
            timeout=20
        )

        response.raise_for_status()

        data = response.json()

        suggestions = data.get(
            "suggestions",
            []
        )

        if not suggestions:
            return None

        # Prefer an airport result when available.
        for suggestion in suggestions:

            if not isinstance(
                suggestion,
                dict
            ):
                continue

            airport = suggestion.get(
                "airport",
                {}
            )

            if isinstance(
                airport,
                dict
            ):

                airport_id = airport.get(
                    "id"
                )

                if airport_id:
                    return airport_id

            # Some autocomplete responses can
            # expose an ID directly.
            suggestion_id = suggestion.get(
                "id"
            )

            if suggestion_id:
                return suggestion_id

        # Final fallback: first useful ID.
        first = suggestions[0]

        if isinstance(
            first,
            dict
        ):

            return (
                first.get("id")
                or
                first.get("value")
            )

        return None

    except Exception as error:

        print(
            "FLIGHT LOCATION ERROR:",
            error
        )

        return None


def normalize_travel_location(value):
    """Normalize a city/airport value for safe route comparisons."""
    return " ".join(
        str(value or "").strip().lower().replace(",", " ").split()
    )


@app.route(
    "/api/flights",
    methods=["GET"]
)
def search_flights():

    from_location = request.args.get(
        "from",
        ""
    ).strip()

    to_location = request.args.get(
        "to",
        ""
    ).strip()

    departure = request.args.get(
        "departure",
        ""
    ).strip()

    return_date = request.args.get(
        "return_date",
        ""
    ).strip()

    trip_type = request.args.get(
        "type",
        "1"
    ).strip()

    budget_raw = request.args.get(
        "budget",
        ""
    ).strip()

    flight_budget = None
    if budget_raw:
        try:
            flight_budget = float(budget_raw)
        except (TypeError, ValueError):
            flight_budget = None

    # Passenger counts
    adults = request.args.get(
        "adults",
        "1"
    ).strip()

    children = request.args.get(
        "children",
        "0"
    ).strip()

    infants = request.args.get(
        "infants",
        "0"
    ).strip()

    # Travel class
    travel_class = request.args.get(
        "travel_class",
        "1"
    ).strip()

    # Direct flights only
    direct_only = request.args.get(
        "direct",
        "false"
    ).strip().lower()


    # =====================================================
    # VALIDATION
    # =====================================================

    if not from_location:

        return jsonify({
            "success": False,
            "error":
                "Please enter the departure city."
        }), 400


    if not to_location:

        return jsonify({
            "success": False,
            "error":
                "Please enter the destination."
        }), 400


    if not departure:

        return jsonify({
            "success": False,
            "error":
                "Please select a departure date."
        }), 400


    # A flight route cannot start and end at the same location.
    if (
        normalize_travel_location(from_location)
        == normalize_travel_location(to_location)
    ):

        return jsonify({
            "success": False,
            "error":
                "Departure and destination cannot be the same. "
                "Please choose two different locations."
        }), 400


    # Google Flights:
    # 1 = round trip
    # 2 = one way

    if trip_type not in (
        "1",
        "2"
    ):

        trip_type = "1"


    if (
        trip_type == "1"
        and not return_date
    ):

        return jsonify({
            "success": False,
            "error":
                "Please select a return date."
        }), 400


    if (
        trip_type == "2"
        and return_date
    ):

        # Ignore return date for one-way.
        return_date = ""


    if not SERPAPI_KEY:

        return jsonify({
            "success": False,
            "error": "Flight search configuration is missing: SERPAPI_KEY is not configured.",
            "missing_config": "SERPAPI_KEY"
        }), 503


    # =====================================================
    # SAFE PASSENGER VALUES
    # =====================================================

    try:

        adults_value = max(
            1,
            int(adults)
        )

    except (
        TypeError,
        ValueError
    ):

        adults_value = 1


    try:

        children_value = max(
            0,
            int(children)
        )

    except (
        TypeError,
        ValueError
    ):

        children_value = 0


    try:

        infants_value = max(
            0,
            int(infants)
        )

    except (
        TypeError,
        ValueError
    ):

        infants_value = 0


    if travel_class not in (
        "1",
        "2",
        "3",
        "4"
    ):

        travel_class = "1"


    # =====================================================
    # FIND FLIGHT LOCATION IDS
    # =====================================================

    departure_code = get_flight_location_id(
        from_location
    )

    arrival_code = get_flight_location_id(
        to_location
    )


    if not departure_code:

        return jsonify({
            "success": False,
            "error":
                "Could not identify the departure location: "
                f"{from_location}"
        }), 400


    if not arrival_code:

        return jsonify({
            "success": False,
            "error":
                "Could not identify the destination: "
                f"{to_location}"
        }), 400


    # Different spellings can resolve to the same airport/city.
    if str(departure_code).strip().upper() == str(arrival_code).strip().upper():

        return jsonify({
            "success": False,
            "error":
                "Departure and destination resolve to the same airport. "
                "Please choose a different destination."
        }), 400


    # =====================================================
    # GOOGLE FLIGHTS PARAMETERS
    # =====================================================

    params = {

        "engine":
            "google_flights",

        "departure_id":
            departure_code,

        "arrival_id":
            arrival_code,

        "outbound_date":
            departure,

        "type":
            trip_type,

        "travel_class":
            travel_class,

        "adults":
            adults_value,

        "children":
            children_value,

        "infants_in_seat":
            infants_value,

        "currency":
            "INR",

        "hl":
            "en",

        "gl":
            "in",

        "api_key":
            SERPAPI_KEY
    }


    # Round trip needs return date.
    if (
        trip_type == "1"
        and return_date
    ):

        params["return_date"] = return_date


    # Direct flights only.
    # SerpApi uses stops=1 for nonstop only.
    if direct_only in (
        "true",
        "1",
        "yes",
        "on"
    ):

        params["stops"] = "1"


    # =====================================================
    # CALL SERPAPI
    # =====================================================

    try:

        response = requests.get(
            "https://serpapi.com/search.json",
            params=params,
            timeout=30
        )

        response.raise_for_status()

        data = response.json()


        # SerpApi can return an error object
        # even when HTTP status is 200.
        if data.get("error"):

            return jsonify({
                "success": False,
                "error":
                    data.get(
                        "error"
                    )
            }), 502


        # =================================================
        # COLLECT FLIGHT OPTIONS
        # =================================================

        raw_flights = (
            data.get(
                "best_flights",
                []
            )
            +
            data.get(
                "other_flights",
                []
            )
        )


        flights = []


        for option in raw_flights:

            if not isinstance(
                option,
                dict
            ):
                continue


            segments = option.get(
                "flights",
                []
            )


            if not segments:
                continue


            first = segments[0]

            last = segments[-1]


            # ---------------------------------------------
            # AIRLINE
            # ---------------------------------------------

            airline = first.get(
                "airline",
                "Airline"
            )


            # ---------------------------------------------
            # FLIGHT NUMBERS
            # ---------------------------------------------

            flight_numbers = []


            for segment in segments:

                number = segment.get(
                    "flight_number"
                )

                if number:

                    flight_numbers.append(
                        number
                    )


            # ---------------------------------------------
            # DURATION
            # ---------------------------------------------

            total_duration = option.get(
                "total_duration"
            )


            if total_duration is not None:

                try:

                    total_duration = int(
                        total_duration
                    )

                    hours = (
                        total_duration
                        // 60
                    )

                    minutes = (
                        total_duration
                        % 60
                    )

                    duration_text = (
                        f"{hours}h "
                        f"{minutes}m"
                    )

                except (
                    TypeError,
                    ValueError
                ):

                    duration_text = "--"

            else:

                duration_text = "--"


            # ---------------------------------------------
            # STOPS
            # ---------------------------------------------

            stops = max(
                0,
                len(segments) - 1
            )


            if stops == 0:

                stops_text = "Direct"

            elif stops == 1:

                stops_text = "1 stop"

            else:

                stops_text = (
                    f"{stops} stops"
                )


            # ---------------------------------------------
            # AIRPORT DATA
            # ---------------------------------------------

            departure_airport = (
                first.get(
                    "departure_airport",
                    {}
                )
                or {}
            )

            arrival_airport = (
                last.get(
                    "arrival_airport",
                    {}
                )
                or {}
            )


            # ---------------------------------------------
            # PRICE
            # ---------------------------------------------

            price = option.get(
                "price"
            )


            # ---------------------------------------------
            # BOOKING TOKEN
            # ---------------------------------------------

            booking_token = option.get(
                "booking_token"
            )


            # ---------------------------------------------
            # FLIGHT RESULT
            # ---------------------------------------------

            flights.append({

                "airline":
                    airline,

                "flight_number":
                    ", ".join(
                        flight_numbers
                    ),

                "departure_airport":
                    departure_airport.get(
                        "name",
                        "--"
                    ),

                "departure_code":
                    departure_airport.get(
                        "id",
                        ""
                    ),

                "departure_time":
                    departure_airport.get(
                        "time",
                        "--"
                    ),

                "arrival_airport":
                    arrival_airport.get(
                        "name",
                        "--"
                    ),

                "arrival_code":
                    arrival_airport.get(
                        "id",
                        ""
                    ),

                "arrival_time":
                    arrival_airport.get(
                        "time",
                        "--"
                    ),

                "duration":
                    duration_text,

                "stops":
                    stops_text,

                "price":
                    price,

                "within_budget":
                    (float(price) <= flight_budget) if (price is not None and flight_budget is not None) else None,

                "budget_diff":
                    round(flight_budget - float(price)) if (price is not None and flight_budget is not None) else None,

                "booking_token":
                    booking_token,

                "airline_logo":
                    first.get(
                        "airline_logo",
                        ""
                    ),

                "airplane":
                    first.get(
                        "airplane",
                        ""
                    )
            })


        # =================================================
        # RESPONSE
        # =================================================

        return jsonify({

            "success":
                True,

            "from":
                from_location,

            "to":
                to_location,

            "departure":
                departure,

            "return_date":
                return_date,

            "trip_type":
                trip_type,

            "budget":
                flight_budget,

            "flights":
                flights,

            "count":
                len(flights),

            "departure_id":
                departure_code,

            "arrival_id":
                arrival_code
        })


    except requests.RequestException as error:

        print(
            "FLIGHT API REQUEST ERROR:",
            error
        )

        return jsonify({

            "success":
                False,

            "error":
                "Unable to connect to the flight search service.",

            "details":
                str(error)

        }), 502


    except Exception as error:

        print(
            "FLIGHT SEARCH ERROR:",
            error
        )

        return jsonify({

            "success":
                False,

            "error":
                "Flight search failed.",

            "details":
                str(error)

        }), 500
# =========================================================
# GOOGLE HOTELS SEARCH
# =========================================================

def demo_hotels(destination, check_in, check_out):
    """Fallback hotel options for the student-project prototype."""
    return [
        {
            "name": f"The Residency {destination}",
            "location": destination,
            "rating": 4.4,
            "price": 2499,
            "currency": "INR",
            "room": "Deluxe Room",
            "meal": "Breakfast available",
            "image": "",
            "link": ""
        },
        {
            "name": f"Grand Central {destination}",
            "location": destination,
            "rating": 4.5,
            "price": 2999,
            "currency": "INR",
            "room": "Standard Room",
            "meal": "Breakfast included",
            "image": "",
            "link": ""
        },
        {
            "name": f"Premium City Hotel {destination}",
            "location": destination,
            "rating": 4.7,
            "price": 4299,
            "currency": "INR",
            "room": "Premium Room",
            "meal": "Breakfast included",
            "image": "",
            "link": ""
        },
        {
            "name": f"Holiday Inn {destination}",
            "location": destination,
            "rating": 4.3,
            "price": 3899,
            "currency": "INR",
            "room": "Executive Room",
            "meal": "Breakfast available",
            "image": "",
            "link": ""
        },
        {
            "name": f"Treebo Premium {destination}",
            "location": destination,
            "rating": 4.1,
            "price": 2199,
            "currency": "INR",
            "room": "Deluxe Room",
            "meal": "Room only",
            "image": "",
            "link": ""
        }
    ]


USD_TO_INR_RATE = 85

def convert_usd_to_inr_price(raw_price):
    if not raw_price or raw_price == "Not available":
        return "Not available"
    if isinstance(raw_price, (int, float)):
        if raw_price < 500:
            inr = int(round(raw_price * USD_TO_INR_RATE))
            return f"₹{inr:,}"
        return f"₹{int(round(raw_price)):,}"

    price_str = str(raw_price).strip()
    if not price_str or price_str.lower() in ["not available", "none", "n/a", "price unavailable"]:
        return "Not available"

    if "₹" in price_str and "$" not in price_str:
        return price_str

    if "$" in price_str:
        def replace_dollar(match):
            try:
                usd = float(match.group(1).replace(",", ""))
                inr = int(round(usd * USD_TO_INR_RATE))
                return f"₹{inr:,}"
            except ValueError:
                return match.group(0)
        return re.sub(r"\$\s*([\d,]+(?:\.\d+)?)", replace_dollar, price_str)

    num_match = re.match(r"^(\d+(?:\.\d+)?)$", price_str)
    if num_match:
        val = float(num_match.group(1))
        if val < 500:
            inr = int(round(val * USD_TO_INR_RATE))
            return f"₹{inr:,}"
        return f"₹{int(round(val)):,}"

    return price_str


@app.route(
    "/api/hotels",
    methods=["GET"]
)
def search_hotels():
    destination = request.args.get("destination", "").strip()
    check_in = request.args.get("check_in", "").strip()
    check_out = request.args.get("check_out", "").strip()

    if not destination:
        return jsonify({
            "success": False,
            "error": "Please enter a hotel destination."
        }), 400

    if not SERPAPI_KEY:
        return jsonify({
            "success": False,
            "error": "SerpApi key is not configured."
        }), 500

    # 1. Geocode destination to validate location and get real coordinates
    geo = geocode_location(destination)

    # 2. Determine search query
    lower = destination.lower()
    has_hotel_kw = any(w in lower for w in ["hotel", "resort", "inn", "suites", "motel", "lodge", "palace", "stay"])
    query = destination if has_hotel_kw else f"hotels in {destination}"

    params = {
        "engine": "google_maps",
        "type": "search",
        "q": query,
        "api_key": SERPAPI_KEY
    }
    if geo:
        params["ll"] = f"@{geo['lat']},{geo['lng']},14z"

    try:
        response = requests.get(
            "https://serpapi.com/search.json",
            params=params,
            timeout=20
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as error:
        print("HOTEL SEARCH REQUEST ERROR:", error)
        return jsonify({
            "success": False,
            "error": "Hotel search service is temporarily unavailable.",
            "details": str(error)
        }), 502

    raw_places = []
    if isinstance(data.get("place_results"), dict):
        raw_places.append(data["place_results"])
    for p in data.get("local_results", []):
        if isinstance(p, dict):
            raw_places.append(p)

    # If 0 results and we used specific hotel query, try fallback with 'hotels in {destination}'
    if not raw_places and has_hotel_kw:
        params["q"] = f"hotels in {destination}"
        try:
            fallback_resp = requests.get(
                "https://serpapi.com/search.json",
                params=params,
                timeout=15
            )
            fallback_data = fallback_resp.json()
            if isinstance(fallback_data.get("place_results"), dict):
                raw_places.append(fallback_data["place_results"])
            for p in fallback_data.get("local_results", []):
                if isinstance(p, dict):
                    raw_places.append(p)
        except Exception:
            pass

    # If geocoding failed, check if returned places genuinely match query keywords
    if not geo:
        query_words = [w for w in re.findall(r"\w+", lower) if len(w) >= 3 and w not in ["hotel", "hotels", "near", "in"]]
        matches = False
        for p in raw_places:
            p_text = f"{p.get('title', '')} {p.get('address', '')}".lower()
            if any(w in p_text for w in query_words):
                matches = True
                break
        if not matches:
            return jsonify({
                "success": False,
                "error": f"Location not found for '{destination}'. Please enter a valid city or destination."
            }), 404

    hotels = []
    for p in raw_places:
        name = p.get("title")
        if not name:
            continue

        gps = p.get("gps_coordinates") or {}
        p_lat = gps.get("latitude")
        p_lng = gps.get("longitude")

        distance_str = None
        if geo and p_lat is not None and p_lng is not None:
            try:
                dist = round(haversine_distance(geo["lat"], geo["lng"], float(p_lat), float(p_lng)), 1)
                distance_str = f"{dist} km from destination"
            except Exception:
                pass

        hotels.append({
            "name": name,
            "address": p.get("address") or "Not available",
            "rating": p.get("rating"),
            "reviews": p.get("reviews"),
            "price": convert_usd_to_inr_price(p.get("price")),
            "distance": distance_str or "Not available",
            "website": p.get("website"),
            "phone": p.get("phone") or "Not available",
            "thumbnail": p.get("thumbnail"),
            "reviews_link": p.get("reviews_link"),
            "type": p.get("type") or "Hotel / Accommodation"
        })

    if not hotels:
        return jsonify({
            "success": False,
            "error": f"No hotels or accommodations found for '{destination}'."
        }), 404

    return jsonify({
        "success": True,
        "destination": destination,
        "check_in": check_in,
        "check_out": check_out,
        "hotels": hotels,
        "count": len(hotels)
    })


# =========================================================
# NAVISPHERE AI - FOOD THAT FITS YOU (RECOMMENDATIONS & MEAL PLAN)
# =========================================================

def build_fallback_food_data(location, food_pref, dietary_pref, health_rest, budget, duration):
    loc_clean = (location or "Your Destination").strip().title()
    food_p = (food_pref or "Vegetarian").strip()
    diet_p = (dietary_pref or "Traditional Local Cuisine").strip()
    health_r = (health_rest or "None").strip()
    try:
        budget_num = int(budget) if budget else 600
    except:
        budget_num = 600
    try:
        dur_num = int(duration) if duration else 7
    except:
        dur_num = 7
    dur_num = max(1, min(dur_num, 14))

    is_veg = "veg" in food_p.lower() and "non" not in food_p.lower()
    is_vegan = "vegan" in food_p.lower()
    is_jain = "jain" in food_p.lower()
    is_halal = "halal" in food_p.lower()
    is_low_sugar = "low-sugar" in health_r.lower() or "sugar" in health_r.lower()
    is_low_sodium = "low-sodium" in health_r.lower() or "sodium" in health_r.lower() or "salt" in health_r.lower()
    is_high_protein = "high-protein" in health_r.lower() or "protein" in diet_p.lower()
    has_allergy = any(w in health_r.lower() for w in ["allergy", "intolerance", "celiac", "peanut", "nut", "lactose", "gluten"])

    b_cost = max(40, int(budget_num * 0.20))
    l_cost = max(80, int(budget_num * 0.40))
    d_cost = max(80, int(budget_num * 0.35))
    s_cost = max(20, int(budget_num * 0.10))

    allergy_notice = (
        "Health & Allergy Advisory: Ingredients, allergen cross-contamination, and preparation methods must always be verified directly with the restaurant staff or qualified food service professionals. This guide serves solely as a dietary preference recommendation, not medical advice."
        if (has_allergy or is_low_sodium or is_low_sugar or health_r != "None") else
        "Note: Health information is treated strictly as dietary preferences. Always confirm ingredients and cooking practices directly with restaurant staff."
    )

    if is_jain:
        top_foods = [
            {
                "name": f"Jain Thali ({loc_clean} Style)",
                "category": "Pure Jain Traditional",
                "diet_tags": ["Jain", "Pure Veg", "No Root Veg"],
                "description": f"A wholesome spread of steamed rice/rotis, moong dal, seasonal gourd subzi, and fresh curd prepared strictly without onion, garlic, or root vegetables.",
                "why_fits": f"Conforms strictly to Jain dietary principles while keeping within your ₹{budget_num}/day budget.",
                "estimated_price": f"Estimated: ₹{int(l_cost*0.9)} - ₹{int(l_cost*1.2)}",
                "recommended_venue_types": "Pure Jain Bhojanalayas, heritage vegetarian thali dining halls"
            },
            {
                "name": "Moong Dal Khichdi with Ghee",
                "category": "Comfort Main",
                "diet_tags": ["Jain", "Easy Digestion", "Lower-Sodium Friendly"],
                "description": "Slow-cooked yellow lentils and rice tempered with cumin seeds, asafoetida (hing), and pure ghee. Mild, soothing, and easily customized for low salt.",
                "why_fits": "Zero root vegetables, naturally high protein from yellow moong, and gentle on the stomach.",
                "estimated_price": f"Estimated: ₹{int(l_cost*0.8)} - ₹{int(l_cost*1.0)}",
                "recommended_venue_types": "Traditional vegetarian restaurants"
            },
            {
                "name": "Khaman Dhokla (Jain Recipe)",
                "category": "Steamed Snack / Breakfast",
                "diet_tags": ["Jain", "Steamed", "Low-Sugar"],
                "description": "Steamed gram flour cake tempered with mustard seeds and fresh curry leaves, sweetened with mild green chili temper without sugar syrup.",
                "why_fits": "100% steamed, no onion/garlic/roots, low glycemic impact, and highly affordable.",
                "estimated_price": f"Estimated: ₹{int(b_cost*0.7)} - ₹{int(b_cost*1.0)}",
                "recommended_venue_types": "Farsan sweetshops and heritage breakfast counters"
            },
            {
                "name": "Paneer Methi Malai (Jain Gravy)",
                "category": "Rich Dinner Main",
                "diet_tags": ["Jain", "High-Protein", "Nut-Free by Request"],
                "description": "Soft fresh paneer cubes and fenugreek leaves simmered in a creamy melon-seed and milk reduction, entirely free of onion and garlic.",
                "why_fits": "Provides substantial vegetarian protein while strictly respecting Jain rules.",
                "estimated_price": f"Estimated: ₹{int(d_cost*0.9)} - ₹{int(d_cost*1.3)}",
                "recommended_venue_types": "Specialty Jain dining restaurants"
            }
        ]
    elif is_vegan:
        top_foods = [
            {
                "name": f"Steamed Idli with Sambar & Tomato Chutney",
                "category": "Traditional Vegan Breakfast",
                "diet_tags": ["100% Vegan", "Fermented", "Low-Fat"],
                "description": "Soft steamed rice and black gram lentil cakes served with vegetable-rich lentil sambar and freshly ground tomato-chili chutney.",
                "why_fits": "Completely dairy-free, oil-free steaming, rich in prebiotic digestive benefits.",
                "estimated_price": f"Estimated: ₹{int(b_cost*0.7)} - ₹{int(b_cost*1.0)}",
                "recommended_venue_types": "Traditional South Indian tiffin centers, Darshinis"
            },
            {
                "name": "Tofu / Soya Matar Curry with Phulkas",
                "category": "High-Protein Vegan Main",
                "diet_tags": ["Vegan", "High-Protein", "Plant-Based"],
                "description": "Tender tofu or soy chunks with tender green peas in an aromatic tomato-cumin gravy, paired with whole wheat dry flatbreads.",
                "why_fits": "Over 20g plant protein per serving, completely free of dairy and animal products.",
                "estimated_price": f"Estimated: ₹{int(l_cost*0.8)} - ₹{int(l_cost*1.1)}",
                "recommended_venue_types": "Clean eating cafes, progressive regional kitchens"
            },
            {
                "name": "Sprouted Moong Salad with Lemon & Coriander",
                "category": "Wholesome Salad / Light Snack",
                "diet_tags": ["Vegan", "Low-Sugar", "Raw Clean"],
                "description": "Crisp sprouted green moong beans tossed with diced cucumber, tomatoes, fresh coriander, green chilies, and tangy lemon juice.",
                "why_fits": "Zero added sugar, high micronutrients and dietary fiber, perfectly low sodium on request.",
                "estimated_price": f"Estimated: ₹{int(s_cost*0.8)} - ₹{int(s_cost*1.2)}",
                "recommended_venue_types": "Juice bars, local organic food stalls"
            },
            {
                "name": "Dal Tadka with Steamed Brown/Basmati Rice",
                "category": "Hearty Plant Main",
                "diet_tags": ["Vegan", "Heart-Healthy", "Budget-Friendly"],
                "description": "Yellow toor dal tempered with cumin seeds, garlic, and red chilies in cold-pressed mustard or sesame oil (no ghee).",
                "why_fits": f"Classic comfort food prepared 100% plant-based, comfortably within your daily ₹{budget_num} allocation.",
                "estimated_price": f"Estimated: ₹{int(d_cost*0.8)} - ₹{int(d_cost*1.1)}",
                "recommended_venue_types": "Local dhabas, family-run restaurants"
            }
        ]
    elif is_halal and not is_veg:
        top_foods = [
            {
                "name": f"Authentic Dum Biryani ({loc_clean} Style)",
                "category": "Halal Regional Icon",
                "diet_tags": ["Halal", "High-Protein", "Iconic Main"],
                "description": "Fragrant long-grain basmati rice layered with halal-certified tender chicken/mutton, saffron, mint, and slow-cooked in a sealed earthen pot.",
                "why_fits": "100% Halal certified dining, protein-dense, and the quintessential regional centerpiece.",
                "estimated_price": f"Estimated: ₹{int(l_cost*1.0)} - ₹{int(l_cost*1.4)}",
                "recommended_venue_types": "Heritage Muslim-owned biryani houses and Halal specialty restaurants"
            },
            {
                "name": "Chicken Seekh Kebab with Mint Chutney",
                "category": "Charcoal Grilled Starter",
                "diet_tags": ["Halal", "High-Protein", "Low-Carb"],
                "description": "Minced halal chicken blended with ginger, garlic, crushed coriander seeds, and grilled over charcoal skewers.",
                "why_fits": "High in lean protein, low in carbohydrates and sugars, satisfying and flavorful.",
                "estimated_price": f"Estimated: ₹{int(d_cost*0.9)} - ₹{int(d_cost*1.2)}",
                "recommended_venue_types": "Halal barbecue grills and tandoor counters"
            },
            {
                "name": "Mutton / Chicken Haleem or Paya Shorba",
                "category": "Nutrient-Dense Slow Stew",
                "diet_tags": ["Halal", "Collagen-Rich", "Deep Flavor"],
                "description": "Slow-simmered halal meat with broken wheat, lentils, and warm whole spices, served with fresh lemon wedges.",
                "why_fits": "Wholesome, warming, traditional, and free of preservatives or excess refined sugars.",
                "estimated_price": f"Estimated: ₹{int(l_cost*0.9)} - ₹{int(l_cost*1.2)}",
                "recommended_venue_types": "Traditional Irani cafes and Mughal culinary centers"
            },
            {
                "name": "Chicken Tikka with Whole Wheat Tandoori Roti",
                "category": "Balanced Dinner",
                "diet_tags": ["Halal", "Lean Protein", "Controlled Salt"],
                "description": "Yogurt-marinated boneless halal chicken breast pieces roasted in a clay tandoor with fresh salad and unbuttered roti.",
                "why_fits": "Lean protein source easily adjusted for lower sodium, respecting your daily food target.",
                "estimated_price": f"Estimated: ₹{int(d_cost*0.9)} - ₹{int(d_cost*1.2)}",
                "recommended_venue_types": "Traditional tandoori eateries"
            }
        ]
    elif not is_veg:
        top_foods = [
            {
                "name": f"Regional Fish Curry with Steamed Rice ({loc_clean})",
                "category": "Seafood Specialty",
                "diet_tags": ["Non-Vegetarian", "High-Protein", "Omega-3 Rich"],
                "description": "Fresh catch simmered in an aromatic curry of kokum/tamarind, coconut or mustard, and ground spices.",
                "why_fits": f"Showcases {loc_clean}'s regional culinary heritage, packed with lean protein.",
                "estimated_price": f"Estimated: ₹{int(l_cost*0.9)} - ₹{int(l_cost*1.3)}",
                "recommended_venue_types": "Authentic seafood dining halls, coastal mess"
            },
            {
                "name": "Tandoori Chicken with Cucumber Onion Raita",
                "category": "Grilled Classic",
                "diet_tags": ["High-Protein", "Low-Carb", "Non-Vegetarian"],
                "description": "Skinless chicken roasted over coal with mild spices, ginger-garlic, and hung curd marinade.",
                "why_fits": "Excellent protein density, minimal added sugars, fitting both fitness and budget priorities.",
                "estimated_price": f"Estimated: ₹{int(d_cost*0.9)} - ₹{int(d_cost*1.3)}",
                "recommended_venue_types": "Local grills, garden restaurants"
            },
            {
                "name": "Egg Bhurji / Omelette with Multigrain Toast",
                "category": "Energizing Breakfast",
                "diet_tags": ["Non-Vegetarian", "High-Protein", "Quick Eat"],
                "description": "Scrambled farm eggs sautéed with onions, green chilies, tomatoes, and fresh cilantro.",
                "why_fits": "High quality morning protein, readily available everywhere, very affordable.",
                "estimated_price": f"Estimated: ₹{int(b_cost*0.7)} - ₹{int(b_cost*1.0)}",
                "recommended_venue_types": "Irani cafes, street food corners, breakfast bistros"
            },
            {
                "name": "Chicken / Lamb Sukka with Parotta or Chapati",
                "category": "Pan-Roasted Main",
                "diet_tags": ["High-Protein", "Rich Spice", "Regional Hero"],
                "description": "Dry-roasted meat tossed in freshly ground black pepper, curry leaves, and toasted coconut.",
                "why_fits": f"Deeply satisfying local preparation that highlights regional spices of {loc_clean}.",
                "estimated_price": f"Estimated: ₹{int(d_cost*1.0)} - ₹{int(d_cost*1.3)}",
                "recommended_venue_types": "Traditional regional restaurants"
            }
        ]
    else:
        top_foods = [
            {
                "name": f"Crispy Masala Dosa with Sambar ({loc_clean})",
                "category": "Signature Breakfast",
                "diet_tags": ["Vegetarian", "Gluten-Free Option", "Traditional"],
                "description": "Crisp fermented rice-lentil crepe golden browned on a cast iron griddle, filled with spiced mashed potato and served with lentil sambar and fresh chutney.",
                "why_fits": f"Beloved regional staple, 100% vegetarian, easily customized for lower salt.",
                "estimated_price": f"Estimated: ₹{int(b_cost*0.7)} - ₹{int(b_cost*1.1)}",
                "recommended_venue_types": "Traditional Udupi Bhavan, South Indian tiffin centers"
            },
            {
                "name": "South / North Indian Meals Thali",
                "category": "Wholesome Lunch",
                "diet_tags": ["Vegetarian", "Balanced Diet", "Value Choice"],
                "description": "A balanced banana leaf or stainless plate assortment of kootu, poriyal, sambar, rasam, curd, appalam, and steamed rice.",
                "why_fits": f"Maximum variety and nutritional balance well within your daily budget of ₹{budget_num}.",
                "estimated_price": f"Estimated: ₹{int(l_cost*0.8)} - ₹{int(l_cost*1.2)}",
                "recommended_venue_types": "Traditional mess, pure vegetarian thali restaurants"
            },
            {
                "name": "Paneer Butter Masala with Whole Wheat Roti",
                "category": "Dinner Main",
                "diet_tags": ["Vegetarian", "High-Protein", "North Indian Classic"],
                "description": "Fresh cottage cheese cubes simmered in a mildly spiced cashew-tomato puree, served with tandoor baked rotis.",
                "why_fits": "High in vegetarian protein, deeply satisfying dinner, widely available.",
                "estimated_price": f"Estimated: ₹{int(d_cost*0.9)} - ₹{int(d_cost*1.3)}",
                "recommended_venue_types": "Family vegetarian restaurants, dhabas"
            },
            {
                "name": "Sundal / Sprouted Bean Salad",
                "category": "Protein Snack",
                "diet_tags": ["Vegetarian", "Low-Sugar", "Heart-Healthy"],
                "description": "Boiled chickpeas or green gram tempered with mustard seeds, curry leaves, ginger, and a light sprinkling of fresh grated coconut.",
                "why_fits": "Low glycemic index, zero added sugar, minimal salt, fantastic fiber and protein.",
                "estimated_price": f"Estimated: ₹{int(s_cost*0.7)} - ₹{int(s_cost*1.1)}",
                "recommended_venue_types": "Temple precincts, beach promenades, local tiffin carts"
            }
        ]

    meal_plan = []
    if is_jain:
        day_templates = [
            ("Classic Jain Heritage", ("Poha (Jain style, no onion/potatoes) with green peas", b_cost), ("Jain Thali with moong dal, bottle gourd curry & phulkas", l_cost), ("Khichdi with kadhi (prepared without garlic/onion)", d_cost), ("Roasted Makhana (Foxnuts) with rock salt", s_cost)),
            ("Steamed & Light Specials", ("Khaman Dhokla with green chili tempering", b_cost), ("Tomato Paneer Curry with whole wheat rotis & steamed rice", l_cost), ("Moong Dal Chilla (savory lentil pancake) with mint chutney", d_cost), ("Cucumber & tomato slices with lemon juice", s_cost)),
            ("Protein & Dal Harmony", ("Sprouted Moong Usal (Jain style) with warm pav/rotis", b_cost), ("Chole (Jain recipe without onion/garlic) with steamed jeera rice", l_cost), ("Methi Paneer with soft tawa rotis & cucumber salad", d_cost), ("Warm spiced milk with cardamom", s_cost)),
            ("Gujarati / Rajasthani Jain Flavors", ("Methi Thepla with fresh curd & mango chunda", b_cost), ("Gatte ki Sabzi (gram flour dumplings) with rice and rotis", l_cost), ("Dal Dhokli (savory whole wheat pasta in spiced lentil soup)", d_cost), ("Roasted chana (chickpeas)", s_cost)),
            ("South Indian Jain Delights", ("Plain Steamed Idlis with Jain sambar (drumstick/tomato)", b_cost), ("Curd Rice tempered with mustard, ginger & curry leaves", l_cost), ("Plain Dosa with tomato-mint chutney", d_cost), ("Tender coconut water", s_cost)),
            ("Nutritious Comforts", ("Rava Upma with green peas and beans (no onions)", b_cost), ("Panchmel Dal with bajra or wheat rotis & jain salad", l_cost), ("Tawa Paneer Bhurji (Jain style) with phulkas", d_cost), ("Steamed corn kernels with lemon and black pepper", s_cost)),
            ("Celebration Finale", ("Jain Khandvi with mustard seed garnish", b_cost), ("Royal Jain Paneer Makhani with missi roti & jeera rice", l_cost), ("Light vegetable pulao (beans, peas, paneer) with boondi raita", d_cost), ("Roasted peanut/seed mix or dried fruit bite", s_cost))
        ]
    elif is_vegan:
        day_templates = [
            ("Traditional Fermented Delights", ("Steamed Idlis (4 pcs) with coconut-free tomato chutney & sambar", b_cost), ("Vegetable Biryani (oil-cooked, no ghee) with cucumber salad", l_cost), ("Tofu Tikka Masala with whole wheat tawa chapati", d_cost), ("Fresh seasonal tender coconut water", s_cost)),
            ("Grain & Legume Power", ("Oatmeal cooked with almond/soy milk, chia seeds & banana", b_cost), ("Rajma (Red Kidney Beans) Masala with steamed brown rice", l_cost), ("Yellow Moong Dal Tadka with roasted papad & phulkas", d_cost), ("Sprouted mung bean salad with lemon & cilantro", s_cost)),
            ("Coastal Plant Bounty", ("Appam with vegetable coconut milk stew", b_cost), ("Chickpea & Spinach curry (Chana Saag) with steamed basmati", l_cost), ("Stir-fried vegetables & crispy tofu with rice noodles", d_cost), ("Roasted spiced pumpkin seeds", s_cost)),
            ("Hearty & Homestyle", ("Besan Chilla (gram flour savory crepes) with coriander chutney", b_cost), ("Black Lentil (Dal Makhani - Coconut Cream base) with rotis", l_cost), ("Mushroom & Matar Curry with warm whole grain rotis", d_cost), ("Fresh seasonal fruit bowl (papaya/guava)", s_cost)),
            ("Fiber & Antioxidant Boost", ("Smoothie bowl with banana, spinach, flax seeds & berries", b_cost), ("Lentil & vegetable khichdi tempered with cumin in sesame oil", l_cost), ("Baingan Bharta (smoked roasted eggplant) with tawa rotis", d_cost), ("Air-popped makhana (foxnuts) with turmeric & pinch of salt", s_cost)),
            ("Street & Cafe Veganized", ("Poha with peanuts, curry leaves, green peas & squeeze of lime", b_cost), ("Aloo Gobi Matar (dry potato cauliflower) with parathas", l_cost), ("Soya Chunk Curry with cumin rice & mixed green salad", d_cost), ("Masala black tea or herbal infused decoction", s_cost)),
            ("Grand Plant Feast", ("Rava Dosa with vegetable sambar & ginger chutney", b_cost), ("South Indian Meals (vegan style: sambar, rasam, kootu, rice)", l_cost), ("Dal Palak (Spinach Lentil soup) with jeera rice & phulkas", d_cost), ("Walnut & date raw energy bites", s_cost))
        ]
    elif is_halal and not is_veg:
        day_templates = [
            ("Mughlai Heritage Morning & Feast", ("Halal Chicken Kheema Pav with green chilies & mint", b_cost), ("Chicken Dum Biryani (Halal) with mirchi ka salan & raita", l_cost), ("Grilled Chicken Seekh Kebab with roomali roti & salad", d_cost), ("Irani Chai with Osmania biscuit", s_cost)),
            ("Tandoor & Coastal Flavors", ("Egg Paratha with spicy onion-tomato gravy", b_cost), ("Halal Mutton Rogan Josh with steamed fragrant basmati rice", l_cost), ("Tandoori Chicken Quarter with mint chutney & plain naan", d_cost), ("Fresh lime water with black salt", s_cost)),
            ("Wholesome Stews & Curries", ("Chicken Shami Kebab sandwich with whole grain bread", b_cost), ("Halal Chicken Korma with whole wheat tandoori rotis", l_cost), ("Slow-cooked Mutton Nihari with ginger shreds & warm kulcha", d_cost), ("Mixed roasted nuts and raisins", s_cost)),
            ("Light & High-Protein", ("Boiled eggs (3 pcs) with sautéed vegetables & brown toast", b_cost), ("Fish Tikka / Coastal Curry with steamed rice & sliced onions", l_cost), ("Chicken Reshmi Kebab with fresh mixed garden salad", d_cost), ("Sweet lassi or fresh buttermilk", s_cost)),
            ("Street Style Halal Classics", ("Bun Maska & Omelette with spiced tea", b_cost), ("Halal Mutton Biryani with cucumber raita", l_cost), ("Chicken Malai Tikka with phulkas and dal tadka", d_cost), ("Fruit chaat with chaat masala", s_cost)),
            ("Regional Comforts", ("Chicken Keema Paratha with spiced curd", b_cost), ("Butter Chicken (Halal) with butter-free garlic roti", l_cost), ("Mutton Pepper Fry with steamed rice and rasam", d_cost), ("Charcoal roasted corn cob with lemon", s_cost)),
            ("Royal Celebratory Banquet", ("Akuri (spiced scrambled eggs) with toasted pav", b_cost), ("Hyderabadi Halal Haleem garnished with fried onions & mint", l_cost), ("Grilled Fish / Mutton Seekh with saffron pulao", d_cost), ("Badam Milk (Almond saffron milk)", s_cost))
        ]
    elif not is_veg:
        day_templates = [
            ("Energizing Start & Coastal Catch", ("Masala Omelette with multigrain toast & grilled tomato", b_cost), ("Regional Fish Curry with hot steamed rice & papad", l_cost), ("Tandoori Chicken with mint chutney & wheat rotis", d_cost), ("Coconut water or roasted spiced peanuts", s_cost)),
            ("Rich Proteins & Grills", ("Chicken sausage / egg scramble with sautéed spinach", b_cost), ("Chicken Biryani with fresh cucumber-onion raita", l_cost), ("Grilled Fish Fillet with lemon butter sauce & tossed greens", d_cost), ("Spiced buttermilk (chaas)", s_cost)),
            ("Homestyle Non-Veg Flavors", ("Egg Bhurji with warm buttered pav", b_cost), ("Homestyle Mutton / Lamb Curry with chapati & rice", l_cost), ("Chicken Sukka with whole wheat parotta", d_cost), ("Fresh seasonal cut fruits", s_cost)),
            ("Lean & Clean Fuel", ("Boiled egg whites with avocado/chickpea salad", b_cost), ("Grilled Chicken Breast with stir-fry broccoli & quinoa/rice", l_cost), ("Clear chicken soup with shredded meat & steamed momos", d_cost), ("Roasted makhana", s_cost)),
            ("Local Traditional Specials", ("Idiyappam with aromatic chicken kurma", b_cost), ("Prawns / Fish Masala with Kerala red rice or basmati", l_cost), ("Mutton Chops / Keema curry with tawa rotis", d_cost), ("Filter coffee or local tea", s_cost)),
            ("Barbecue & Comfort Night", ("Egg Roll / Chicken Wrap with mint dip", b_cost), ("Chicken Tikka Masala with tandoori rotis & dal", l_cost), ("Pepper Chicken Gravy with hot steamed jeera rice", d_cost), ("Cucumber & carrot sticks with hummus", s_cost)),
            ("Weekend Culinary Showcase", ("Egg Dosa or Appam with egg roast", b_cost), ("Grand Regional Meat Thali (curry, fry, rice, rasam)", l_cost), ("Charcoal Barbecue Chicken Platter with garden salad", d_cost), ("Fresh sugarcane juice or tender coconut", s_cost))
        ]
    else:
        day_templates = [
            ("Traditional Tiffin & Thali", ("Crispy Masala Dosa with coconut chutney & lentil sambar", b_cost), ("South Indian / North Indian Veg Thali with 3 vegetables, dal & rice", l_cost), ("Paneer Tikka Masala with whole wheat tandoori rotis", d_cost), ("Filter Coffee or Masala Chai with roasted chana", s_cost)),
            ("Steamed & Wholesome", ("Steamed Idli & Medu Vada combo with sambar", b_cost), ("Rajma Chawal (Red kidney bean curry with cumin basmati rice)", l_cost), ("Dal Tadka with Palak Paneer and phulkas", d_cost), ("Sundal (tempered boiled chickpeas with mustard & coconut)", s_cost)),
            ("Grain & Fiber Rich", ("Vegetable Rava Upma with ginger-coconut chutney", b_cost), ("Chole Bhature / Chole Kulche with pickled onions", l_cost), ("Vegetable Pulao with mixed vegetable raita and roasted papad", d_cost), ("Fresh tender coconut water", s_cost)),
            ("Protein & Greens Balance", ("Moong Dal Chilla stuffed with crumbled paneer", b_cost), ("Paneer Butter Masala with jeera rice & whole wheat rotis", l_cost), ("Aloo Gobi Matar with yellow dal fry and steamed rice", d_cost), ("Fresh fruit bowl with pomegranate & papaya", s_cost)),
            ("Flavors of the Market", ("Kanda Poha with roasted peanuts & fresh coriander", b_cost), ("Curd Rice tempered with pomegranate seeds & vegetable poriyal", l_cost), ("Baingan Bharta (roasted eggplant mash) with soft tawa rotis", d_cost), ("Spiced buttermilk (neer mor / chaas)", s_cost)),
            ("Crisp & Savory Exploration", ("Mysore Masala Dosa with red chili-garlic paste", b_cost), ("Kadhi Pakoda with steamed basmati rice & roasted papad", l_cost), ("Mushroom & Green Peas Masala with chapati", d_cost), ("Roasted foxnuts (makhana) with black pepper", s_cost)),
            ("Grand Vegetarian Celebration", ("Poori Masala (puffed whole wheat bread with spiced potato curry)", b_cost), ("Vegetable Biryani with mirchi ka salan & boondi raita", l_cost), ("Dal Makhani with Paneer Kulcha & fresh green salad", d_cost), ("Badam milk or hot turmeric spiced milk", s_cost))
        ]

    for d in range(dur_num):
        t_idx = d % len(day_templates)
        theme, b_info, l_info, d_info, s_info = day_templates[t_idx]
        b_est = f"Estimated: ₹{int(b_info[1]*0.85)} - ₹{int(b_info[1]*1.15)}"
        l_est = f"Estimated: ₹{int(l_info[1]*0.85)} - ₹{int(l_info[1]*1.15)}"
        d_est = f"Estimated: ₹{int(d_info[1]*0.85)} - ₹{int(d_info[1]*1.15)}"
        s_est = f"Estimated: ₹{int(s_info[1]*0.80)} - ₹{int(s_info[1]*1.20)}"
        day_tot = int(b_info[1] + l_info[1] + d_info[1] + s_info[1])
        meal_plan.append({
            "day": d + 1,
            "theme": f"Day {d+1}: {theme}",
            "breakfast": {
                "dish": b_info[0],
                "description": f"Tailored to your {food_p} preference, light on the stomach and fueling your morning exploration.",
                "estimated_price": b_est
            },
            "lunch": {
                "dish": l_info[0],
                "description": f"Satisfying mid-day fuel designed to respect your {health_r if health_r != 'None' else 'dietary'} goals.",
                "estimated_price": l_est
            },
            "dinner": {
                "dish": d_info[0],
                "description": f"Relaxing and delicious evening meal fitting your personal dietary guidelines.",
                "estimated_price": d_est
            },
            "optional_snack": {
                "dish": s_info[0],
                "description": "Optional healthy refresher or energizing bite between activities.",
                "estimated_price": s_est
            },
            "estimated_day_total": f"Estimated: ~₹{day_tot} / day"
        })

    return {
        "success": True,
        "location": loc_clean,
        "food_preference": food_p,
        "dietary_preference": diet_p,
        "health_restriction": health_r,
        "budget": budget_num,
        "duration": dur_num,
        "preferences_summary": f"{food_p} · {diet_p} · {health_r if health_r != 'None' else 'Standard Nutrition'} · ₹{budget_num}/day · {dur_num} Days",
        "allergy_reminder": allergy_notice,
        "budget_analysis": {
            "target_daily_budget": f"₹{budget_num}",
            "estimated_daily_average": f"Estimated: ₹{int(budget_num * 0.9)} - ₹{int(budget_num * 1.05)}",
            "budget_verdict": "Realistic & Well-Balanced for local dining",
            "disclaimer": f"All listed prices are estimated local price ranges for {loc_clean}. Exact menu pricing and service charges may vary by venue. NaviSphere does not invent exact restaurant rates or guarantee table availability."
        },
        "top_foods": top_foods,
        "meal_plan": meal_plan
    }


@app.route("/api/food-plan", methods=["POST"])
def api_food_plan():
    data = request.get_json(silent=True) or {}
    location = str(data.get("location") or "").strip()
    food_preference = str(data.get("food_preference") or "Vegetarian").strip()
    dietary_preference = str(data.get("dietary_preference") or "Traditional Local Cuisine").strip()
    health_restriction = str(data.get("health_restriction") or "None").strip()
    budget_raw = data.get("budget", 600)
    duration_raw = data.get("duration", 7)

    if not location:
        return jsonify({
            "success": False,
            "error": "Please enter a location or city name."
        }), 400

    try:
        budget = max(50, int(budget_raw))
    except:
        budget = 600

    try:
        duration = max(1, min(14, int(duration_raw)))
    except:
        duration = 7

    # Attempt generation with Gemini if client available
    if gemini_client:
        prompt = f"""You are an expert culinary travel guide and nutritionist assistant for NaviSphere AI.
Generate personalized "Top Foods to Try" and a complete day-by-day food plan for a traveler.

USER TRAVELER DETAILS:
- Destination / Location: {location}
- Food Preference: {food_preference} (e.g. Vegetarian, Vegan, Non-vegetarian, Jain, Halal, etc.)
- Dietary Preference: {dietary_preference} (e.g. Traditional local cuisine, High-protein, Balanced, Low-carb, etc.)
- Health Dietary Preference / Restriction: {health_restriction} (e.g. Low-sugar preference, Lower-sodium preference, High-protein preference, Allergies/intolerances, etc.)
- Budget: ₹{budget} per person per day
- Trip Duration: {duration} days

CRITICAL COMPLIANCE RULES:
1. STRICTLY RESPECT ALL DIETARY & HEALTH RESTRICTIONS THROUGHOUT:
   - If Vegetarian: absolutely NO meat, poultry, fish, seafood, or eggs.
   - If Vegan: absolutely NO animal products (no dairy, no ghee, no butter, no paneer, no honey, no meat, no eggs).
   - If Jain: strictly vegetarian AND NO root vegetables (NO onions, garlic, potatoes, carrots, radish, beets).
   - If Halal: strictly halal compliant foods, NO pork, NO alcohol or alcohol-derived ingredients.
   - If Non-vegetarian: include authentic regional non-veg dishes (chicken, mutton, fish, egg, etc.).
   - If Low-sugar preference: avoid sweetened foods, sugary desserts, sweet lassi, sugar syrups.
   - If Lower-sodium preference: avoid heavily salted curries, pickles (achaar), papad, processed salty snacks.
   - If High-protein preference: emphasize protein-rich ingredients (lentils, paneer, tofu, sprouts, chicken, fish, eggs as appropriate).
   - If Allergies (e.g. Nut allergy / Peanut-free, Gluten-free, Lactose-free): strictly exclude dishes that contain or are commonly prepared with those allergens (e.g. no cashew gravies or peanut chutneys for nut allergy).
   - Treat health information as dietary preferences/restrictions. Do not diagnose or treat medical conditions.
2. BUDGET REALISM & TRANSPARENCY:
   - Base all meal costs on the traveler's stated budget of ₹{budget}/day.
   - Clearly distinguish estimated prices from exact prices.
   - Label every price explicitly as "Estimated: ₹X - ₹Y" (or "Estimated: ₹X").
   - DO NOT invent fake restaurant menu prices or claim exact live availability.
3. TOP FOODS TO TRY:
   - Provide 4 to 6 authentic, iconic dishes in {location} that strictly fit the user's preferences.
   - Explain why each dish fits their specific diet and health requirements.
4. COMPLETE DAY-BY-DAY FOOD PLAN ({duration} DAYS):
   - Provide a complete plan for all {duration} days (Day 1 to Day {duration}).
   - For every day, include:
     * Breakfast
     * Lunch
     * Dinner
     * Optional snack
   - Avoid unnecessarily repeating the same foods or eateries across days.
5. ALLERGIES / HEALTH REMINDER:
   - Include a brief reminder to verify ingredients with the restaurant/qualified professional when allergies or restrictions apply.

Return ONLY a valid JSON object with the following schema:
{{
  "location": "{location}",
  "preferences_summary": "{food_preference} · {dietary_preference} · {health_restriction} · ₹{budget}/day · {duration} Days",
  "allergy_reminder": "Brief reminder to verify ingredients with restaurant staff / qualified professionals if allergies or health dietary restrictions apply.",
  "budget_analysis": {{
    "target_daily_budget": "₹{budget}",
    "estimated_daily_average": "Estimated: ₹...",
    "budget_verdict": "Comfortable / Moderate / Budget-conscious",
    "disclaimer": "All prices are estimated local dining ranges in {location}. Actual prices vary by venue."
  }},
  "top_foods": [
    {{
      "name": "Dish Name",
      "category": "e.g. Traditional Breakfast / Healthy Main",
      "diet_tags": ["Vegetarian", "Lower-Sodium"],
      "description": "Appetizing description of the dish in {location}",
      "why_fits": "Specific explanation of how this satisfies the user's food and health preferences",
      "estimated_price": "Estimated: ₹80 - ₹140",
      "recommended_venue_types": "e.g. Traditional mess / pure vegetarian Bhavan"
    }}
  ],
  "meal_plan": [
    {{
      "day": 1,
      "theme": "e.g. Heritage Classics",
      "breakfast": {{
        "dish": "Dish name",
        "description": "Description",
        "estimated_price": "Estimated: ₹..."
      }},
      "lunch": {{
        "dish": "Dish name",
        "description": "Description",
        "estimated_price": "Estimated: ₹..."
      }},
      "dinner": {{
        "dish": "Dish name",
        "description": "Description",
        "estimated_price": "Estimated: ₹..."
      }},
      "optional_snack": {{
        "dish": "Snack name",
        "description": "Description",
        "estimated_price": "Estimated: ₹..."
      }},
      "estimated_day_total": "Estimated: ₹..."
    }}
  ]
}}"""

        for model_candidate in ["gemini-3.5-flash-lite", "gemini-flash-latest"]:
            try:
                gemini_res = gemini_client.models.generate_content(
                    model=model_candidate,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.3
                    )
                )
                if gemini_res and gemini_res.text:
                    parsed = json.loads(gemini_res.text)
                    if parsed.get("meal_plan") and parsed.get("top_foods"):
                        parsed["success"] = True
                        parsed["location"] = location
                        parsed["food_preference"] = food_preference
                        parsed["dietary_preference"] = dietary_preference
                        parsed["health_restriction"] = health_restriction
                        parsed["budget"] = budget
                        parsed["duration"] = duration
                        # Ensure allergy reminder is present if restriction selected
                        if not parsed.get("allergy_reminder") or health_restriction != "None":
                            parsed["allergy_reminder"] = (
                                "Health & Allergy Advisory: Ingredients, allergen cross-contamination, and preparation methods must always be verified directly with restaurant staff or qualified food service professionals. This guide serves solely as dietary preference recommendations, not medical advice."
                            )
                        return jsonify(parsed)
            except Exception as e:
                print(f"Gemini food plan error with {model_candidate}:", e)
                continue

    # Fallback if Gemini unavailable or failed
    fallback_data = build_fallback_food_data(
        location=location,
        food_pref=food_preference,
        dietary_pref=dietary_preference,
        health_rest=health_restriction,
        budget=budget,
        duration=duration
    )
    return jsonify(fallback_data)


@app.route("/api/detect-city", methods=["GET", "POST"])
def api_detect_city():
    data = request.get_json(silent=True) or {}
    lat = request.args.get("lat") or data.get("lat")
    lon = request.args.get("lon") or data.get("lon")

    city = None

    # 1. Reverse geocode if coordinates provided
    if lat and lon:
        try:
            url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}"
            res = requests.get(url, headers={"User-Agent": "NaviSphere-Food/1.0"}, timeout=4)
            if res.ok:
                addr = res.json().get("address", {})
                raw_city = (
                    addr.get("city")
                    or addr.get("town")
                    or addr.get("municipality")
                    or addr.get("suburb")
                    or addr.get("state_district")
                    or addr.get("county")
                    or addr.get("state")
                )
                if raw_city:
                    city = re.sub(r"(?i)\s+(corporation|district|municipality|division|taluk)", "", raw_city).strip()
        except Exception as e:
            print("Reverse geocode error:", e)

    # 2. Try IP-based location if no coordinates or reverse geocode failed
    if not city:
        try:
            client_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
            if client_ip and "," in client_ip:
                client_ip = client_ip.split(",")[0].strip()

            ip_url = "https://ipapi.co/json/"
            if client_ip and client_ip not in ["127.0.0.1", "localhost", "::1"]:
                ip_url = f"https://ipapi.co/{client_ip}/json/"

            ip_res = requests.get(ip_url, headers={"User-Agent": "NaviSphere-Food/1.0"}, timeout=3)
            if ip_res.ok:
                city = ip_res.json().get("city")
        except Exception as e:
            print("IP city detection error:", e)

    if not city:
        city = "Chennai"

    return jsonify({
        "success": True,
        "city": city
    })


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    port = int(
        os.environ.get(
            "PORT",
            5000
        )
    )


    app.run(

        host="0.0.0.0",

        port=port,

        debug=True
    )   