import json
import os
import psycopg2
from datetime import datetime

def get_db_connection():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def handler(event: dict, context) -> dict:
    '''API для работы с сообщениями: отправка и получение сообщений в чате'''
    method = event.get('httpMethod', 'GET')
    
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-User-Id'
            },
            'body': '',
            'isBase64Encoded': False
        }
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if method == 'POST':
            body = json.loads(event.get('body', '{}'))
            chat_id = body.get('chat_id')
            user_id = body.get('user_id')
            content = body.get('content', '').strip()
            
            if not content:
                return {
                    'statusCode': 400,
                    'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'Content is required'}),
                    'isBase64Encoded': False
                }
            
            cursor.execute(
                "INSERT INTO messages (chat_id, user_id, content, encrypted) VALUES (%s, %s, %s, %s) RETURNING id, created_at",
                (chat_id, user_id, content, True)
            )
            message = cursor.fetchone()
            
            cursor.execute(
                "UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = %s",
                (user_id,)
            )
            
            conn.commit()
            
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'id': message[0],
                    'chat_id': chat_id,
                    'user_id': user_id,
                    'content': content,
                    'encrypted': True,
                    'created_at': message[1].isoformat(),
                    'sender': 'me'
                }),
                'isBase64Encoded': False
            }
        
        elif method == 'GET':
            params = event.get('queryStringParameters', {})
            chat_id = params.get('chat_id')
            user_id = params.get('user_id')
            
            if not chat_id or not user_id:
                return {
                    'statusCode': 400,
                    'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'chat_id and user_id required'}),
                    'isBase64Encoded': False
                }
            
            cursor.execute('''
                SELECT m.id, m.content, m.user_id, m.encrypted, m.created_at,
                       u.display_name, u.avatar_code
                FROM messages m
                JOIN users u ON m.user_id = u.id
                WHERE m.chat_id = %s
                ORDER BY m.created_at ASC
            ''', (chat_id,))
            
            messages = []
            for row in cursor.fetchall():
                msg_id, content, msg_user_id, encrypted, created_at, display_name, avatar_code = row
                messages.append({
                    'id': msg_id,
                    'text': content,
                    'sender': 'me' if str(msg_user_id) == str(user_id) else 'other',
                    'encrypted': encrypted,
                    'timestamp': created_at.isoformat(),
                    'user': {
                        'name': display_name,
                        'avatar': avatar_code
                    }
                })
            
            cursor.execute(
                "UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = %s",
                (user_id,)
            )
            conn.commit()
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(messages),
                'isBase64Encoded': False
            }
        
        cursor.close()
        conn.close()
        
        return {
            'statusCode': 405,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Method not allowed'}),
            'isBase64Encoded': False
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)}),
            'isBase64Encoded': False
        }
