import json
import os
import psycopg2
from datetime import datetime
import random
import string

def get_db_connection():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def generate_anonymous_id():
    return ''.join(random.choices(string.digits, k=4))

def generate_avatar_code():
    return f"A{random.randint(1, 9)}"

def handler(event: dict, context) -> dict:
    '''API для управления чатами: создание, получение списка чатов пользователя'''
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
            action = body.get('action')
            
            if action == 'create_user':
                anonymous_id = generate_anonymous_id()
                display_name = f"Анонимный пользователь #{anonymous_id}"
                avatar_code = generate_avatar_code()
                
                cursor.execute(
                    "INSERT INTO users (anonymous_id, display_name, avatar_code) VALUES (%s, %s, %s) RETURNING id, anonymous_id, display_name, avatar_code",
                    (anonymous_id, display_name, avatar_code)
                )
                user = cursor.fetchone()
                conn.commit()
                
                return {
                    'statusCode': 200,
                    'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({
                        'id': user[0],
                        'anonymous_id': user[1],
                        'display_name': user[2],
                        'avatar_code': user[3]
                    }),
                    'isBase64Encoded': False
                }
            
            elif action == 'create_chat':
                user_id = body.get('user_id')
                chat_code = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
                
                cursor.execute(
                    "INSERT INTO chats (chat_code) VALUES (%s) RETURNING id, chat_code, created_at",
                    (chat_code,)
                )
                chat = cursor.fetchone()
                chat_id = chat[0]
                
                cursor.execute(
                    "INSERT INTO chat_participants (chat_id, user_id) VALUES (%s, %s)",
                    (chat_id, user_id)
                )
                conn.commit()
                
                return {
                    'statusCode': 200,
                    'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({
                        'id': chat_id,
                        'chat_code': chat[1],
                        'created_at': chat[2].isoformat()
                    }),
                    'isBase64Encoded': False
                }
            
            elif action == 'join_chat':
                user_id = body.get('user_id')
                chat_code = body.get('chat_code')
                
                cursor.execute("SELECT id FROM chats WHERE chat_code = %s", (chat_code,))
                chat = cursor.fetchone()
                
                if not chat:
                    return {
                        'statusCode': 404,
                        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                        'body': json.dumps({'error': 'Chat not found'}),
                        'isBase64Encoded': False
                    }
                
                cursor.execute(
                    "INSERT INTO chat_participants (chat_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (chat[0], user_id)
                )
                conn.commit()
                
                return {
                    'statusCode': 200,
                    'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'success': True, 'chat_id': chat[0]}),
                    'isBase64Encoded': False
                }
        
        elif method == 'GET':
            user_id = event.get('queryStringParameters', {}).get('user_id')
            
            if not user_id:
                return {
                    'statusCode': 400,
                    'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'user_id required'}),
                    'isBase64Encoded': False
                }
            
            cursor.execute('''
                SELECT DISTINCT c.id, c.chat_code, c.created_at,
                       u.id as other_user_id, u.display_name, u.avatar_code, u.last_seen,
                       m.content as last_message, m.created_at as last_message_time
                FROM chats c
                JOIN chat_participants cp ON c.id = cp.chat_id
                LEFT JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id != %s
                LEFT JOIN users u ON cp2.user_id = u.id
                LEFT JOIN LATERAL (
                    SELECT content, created_at 
                    FROM messages 
                    WHERE chat_id = c.id 
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) m ON true
                WHERE cp.user_id = %s
                ORDER BY COALESCE(m.created_at, c.created_at) DESC
            ''', (user_id, user_id))
            
            chats = []
            for row in cursor.fetchall():
                chat_id, chat_code, created_at, other_user_id, display_name, avatar_code, last_seen, last_message, last_message_time = row
                
                cursor.execute(
                    "SELECT COUNT(*) FROM messages WHERE chat_id = %s AND user_id != %s AND created_at > COALESCE((SELECT last_seen FROM users WHERE id = %s), '1970-01-01')",
                    (chat_id, user_id, user_id)
                )
                unread_count = cursor.fetchone()[0]
                
                now = datetime.now()
                is_online = False
                if last_seen:
                    is_online = (now - last_seen).total_seconds() < 300
                
                chats.append({
                    'id': chat_id,
                    'chat_code': chat_code,
                    'name': display_name or 'Новый чат',
                    'avatar': avatar_code or 'A1',
                    'lastMessage': last_message or 'Нет сообщений',
                    'timestamp': (last_message_time or created_at).isoformat(),
                    'unread': unread_count,
                    'online': is_online
                })
            
            cursor.close()
            conn.close()
            
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(chats),
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
