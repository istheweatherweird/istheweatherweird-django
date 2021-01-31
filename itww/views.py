from django.shortcuts import render
from django.http import HttpResponse, Http404
from django.db import connection

import pandas as pd
import json
import requests
from metar import Metar
import os

BASEDIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(BASEDIR, "sql", "hourly.sql"), 'r') as file:
    HOURLY_QUERY = file.read()

def stations(request):
    result = pd.read_sql("select * from places", con=connection)
    data = result.to_json(orient='records')

    return HttpResponse(data, content_type='application/json')

def history(request):
    station_id = request.GET['station_id']
    timestamp = request.GET['timestamp']
    
    query = HOURLY_QUERY.format(station_id=station_id,
                                timestamp=timestamp)

    result = pd.read_sql(query, con=connection).astype({'year': int})
    data = result.to_json(orient='records')

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
