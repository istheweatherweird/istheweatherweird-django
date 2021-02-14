#!/usr/bin/python3

# Use istheweatheweird/settings.py
import istheweatherweird.settings
from django.conf import settings
settings.configure(default_settings=istheweatherweird.settings, DEBUG=True)

# Get database (PostgreSQL) and cache (memcached) connections
from django.db import connection
from django.core.cache import cache

from itww.views import get_stations, get_metar

METAR_KEY = 'metar_{call}'
INSERT_SQL = """
insert into metar (place_id, timestamp, temp)
values ({place_id}, to_timestamp({timestamp}), {temp})
on conflict (place_id, timestamp) do
update
    set temp = {temp}
"""
cur = connection.cursor()

stations = get_stations()
for i, station in stations.iterrows():
    print(station['ICAO'])
    new_metar = get_metar(station['ICAO'])
    cur.execute(INSERT_SQL.format(
        place_id=station['place_id'], 
        timestamp=new_metar['obsTime'],
        temp=new_metar['obsTemp']))

    # key = metar_key.format(call=ICAO)
    # old_metar = cache.get(key)
    # if old_metar != new_metar:
    #    cache.set(key, new_metar)
        # TODO: get current obs from db and set it in cache
        # Trivial for interval now, but need to do work for averages
        # TODO: get history from db and set it in cache

cur.close()
connection.close()
