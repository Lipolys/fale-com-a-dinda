import { TestBed } from '@angular/core/testing';

import { SyncService } from './sync';

describe('Sync', () => {
  let service: SyncService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SyncService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
