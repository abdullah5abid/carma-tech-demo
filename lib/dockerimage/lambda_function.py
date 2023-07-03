import sys

def handler(event, context):
    return {
        "msg": 'Hello from AWS Lambda using Python' + sys.version + '!'
    }