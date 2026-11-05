from pathlib import Path
import json, re, time


def confirmed_quota_error(message):
    value = str(message)
    if re.search(r'captcha|recaptcha|unauthorized|authentication|PUBLIC_ERROR_UNUSUAL_ACTIVITY|unusual.activity', value, re.I):
        return False
    return bool(re.search(r'quota.{0,60}(?:exceed|exhaust|limit)|(?:insufficient|not enough).{0,30}credits?|daily.{0,20}limit|额度.{0,15}(?:不足|耗尽|用完)', value, re.I))


class AccountPolicy:
    """Keep the selected account until a confirmed quota rejection; no numeric image budget."""
    def __init__(self, path):
        self.path = Path(path)
        try:
            self.state = json.loads(self.path.read_text(encoding='utf8'))
            if not isinstance(self.state.get('selected'), dict) or not isinstance(self.state.get('blocked'), dict):
                raise ValueError('Invalid local policy state')
        except (OSError, ValueError, TypeError, AttributeError):
            self.state = {'selected': {}, 'blocked': {}}

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(self.state), encoding='utf8')
        temporary.replace(self.path)

    def candidates(self, candidates, model):
        key = model or 'default'
        chosen = self.state['selected'].get(key)
        now = time.time()
        usable = [item for item in candidates if float(self.state['blocked'].get(f"{key}:{item['token'].id}", 0)) <= now]
        return sorted(usable, key=lambda item: (item['token'].id != chosen, item['token'].id or 0))

    def selected(self, token_id, model):
        key = model or 'default'
        if self.state['selected'].get(key) != token_id:
            self.state['selected'][key] = token_id
            self.save()

    def limited(self, token_id, model, error):
        if not confirmed_quota_error(error):
            return False
        key = model or 'default'
        self.state['blocked'][f'{key}:{token_id}'] = time.time() + 24 * 60 * 60
        self.state['selected'].pop(key, None)
        self.save()
        return True

    def clear(self, token_id, model):
        if self.state['blocked'].pop(f'{model or "default"}:{token_id}', None) is not None:
            self.save()
