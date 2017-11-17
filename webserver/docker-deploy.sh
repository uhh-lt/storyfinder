#!/bin/bash

v=0.0.10

docker login --username=remstef

docker build -t remstef/storyfinder:$v .

docker push remstef/storyfinder:$v
