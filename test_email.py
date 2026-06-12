
from email.message import Message
msg = Message()
msg['Content-Type'] = 'text/plain; charset=utf-8'
msg['Content-Transfer-Encoding'] = '8bit'
msg.set_payload('你好 123456'.encode('utf-8'))
print(msg.as_string())

