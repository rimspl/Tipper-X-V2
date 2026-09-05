import pandas as pd
import numpy as np

# =========================
# USER INPUT PARAMETERS
# =========================

base_pressure = 120  # PSI
daily_pressure_loss = 1  # PSI per day
days = 30

temperature_zone = 45  # Choose: 20, 35, 45, 55

daily_km = 250  # km per truck per day

fuel_efficiency = 1.2  # km per liter (mining truck typical 1-1.5)
fuel_price = 90  # currency per liter

tire_price = 500000  # price per tire
target_tire_life_km = 80000  # expected life in km

total_tires = 1200
tires_per_truck = 6
total_trucks = total_tires / tires_per_truck

# =========================
# TEMPERATURE MULTIPLIERS
# =========================

life_temp_multiplier = {
    20: 1.00,
    35: 1.15,
    45: 1.35,
    55: 1.60
}

rr_temp_multiplier = {
    20: 1.00,
    35: 1.05,
    45: 1.10,
    55: 1.18
}

life_mult = life_temp_multiplier[temperature_zone]
rr_mult = rr_temp_multiplier[temperature_zone]

# =========================
# FUNCTIONS
# =========================

def life_loss_piecewise(percent_loss):
    if percent_loss <= 10:
        loss = percent_loss * 1.0
    elif percent_loss <= 20:
        loss = 10*1.0 + (percent_loss-10)*1.5
    else:
        loss = 10*1.0 + 10*1.5 + (percent_loss-20)*2.0
    return loss

def rolling_resistance_increase(percent_loss):
    return 0.25 * (percent_loss ** 1.3)

# =========================
# SIMULATION
# =========================

results = []

for day in range(1, days + 1):

    pressure = base_pressure - (daily_pressure_loss * day)
    psi_loss = base_pressure - pressure
    percent_loss = (psi_loss / base_pressure) * 100

    # Life loss
    daily_life_percent = life_loss_piecewise(percent_loss) * life_mult / days
    life_km_loss = (daily_life_percent / 100) * target_tire_life_km

    # Rolling resistance
    delta_crr = rolling_resistance_increase(percent_loss) * rr_mult

    # Fuel increase %
    fuel_percent_increase = delta_crr * 0.60  # mining dominance assumption

    # Extra fuel
    baseline_fuel_liters = daily_km / fuel_efficiency
    extra_fuel_liters = baseline_fuel_liters * (fuel_percent_increase / 100)

    extra_fuel_cost = extra_fuel_liters * fuel_price

    # Tire value loss
    tire_value_loss = (daily_life_percent / 100) * tire_price

    results.append([
        day,
        pressure,
        percent_loss,
        daily_life_percent,
        life_km_loss,
        delta_crr,
        fuel_percent_increase,
        extra_fuel_liters,
        extra_fuel_cost,
        tire_value_loss
    ])

columns = [
    "Day",
    "Pressure (PSI)",
    "% Pressure Loss",
    "Daily Life Loss %",
    "Life Loss (km)",
    "% Increase Crr",
    "% Fuel Increase",
    "Extra Fuel (liters)",
    "Extra Fuel Cost",
    "Tire Value Loss"
]

df = pd.DataFrame(results, columns=columns)

total_extra_fuel = df["Extra Fuel (liters)"].sum() * total_trucks
total_fuel_cost = df["Extra Fuel Cost"].sum() * total_trucks
total_tire_value_loss = df["Tire Value Loss"].sum() * total_tires

summary = pd.DataFrame({
    "Metric": [
        "Total Extra Fuel (Liters)",
        "Total Extra Fuel Cost",
        "Total Tire Value Loss"
    ],
    "Value": [
        total_extra_fuel,
        total_fuel_cost,
        total_tire_value_loss
    ]
})

print("Simulation complete. Review results in dataframe 'df' and 'summary'.")
