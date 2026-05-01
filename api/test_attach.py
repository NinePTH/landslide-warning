from routers.readings import attach_current_risk

r = {"station_id":"station_01","rainfall":120.0,"soil_moisture":70.0,"humidity":88.0}
print(attach_current_risk(r))
