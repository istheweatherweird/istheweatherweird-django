from django.shortcuts import render
from django.http import HttpResponse, Http404
from django.db import connection
from django.core.cache import cache

import pandas as pd
import json
import requests
from metar import Metar
import os

BASEDIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(BASEDIR, "sql", "hourly.sql"), 'r') as file:
    HOURLY_QUERY = file.read()

def stations(request):
    data = cache.get("stations")
    if not data:
        result = pd.read_sql("select * from places", con=connection)
        data = result.to_json(orient='records')
        cache.set("stations", data)

    return HttpResponse(data, content_type='application/json')

def history(request):
    place_id = request.GET['place_id']
    timestamp = request.GET['timestamp']
    key = place_id + "_" + timestamp
    
    data = cache.get(key)
    if not data:
        query = HOURLY_QUERY.format(place_id=place_id,
                                    timestamp=timestamp)

        result = pd.read_sql(query, con=connection).astype({'year': int})
        data = result.to_json(orient='records')
        cache.set(key, data)

    return HttpResponse(data, content_type='application/json')

def metar(request):
    call = request.GET['call']
    metar_url = 'http://tgftp.nws.noaa.gov/data/observations/metar/stations/%s.TXT' % call

    response = requests.get(metar_url) 

    if response.status_code != 200:
        raise Http404('Failed to retrieve current weather (%s)' % response.status_code)
    
    metar_txt = response.text.split('\n')[1]
    obs = Metar.Metar(metar_txt)
    obsDict = {'obsTemp': obs.temp.value(),
               'obsTime': obs.time.timestamp()}

    data = json.dumps(obsDict)
    return HttpResponse(data, content_type='application/json')

def index(request):
    return render(request, 'itww/index.html')
