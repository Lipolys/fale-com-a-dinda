import { Component, OnInit } from '@angular/core';
import { FaqService } from '../services/faq';
import { FaqLocal } from '../models/local.models';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page implements OnInit {

  faqs: FaqLocal[] = [];

  constructor(private faqService: FaqService) { }

  ngOnInit() {
    this.faqService.faq$.subscribe(faqs => {
      this.faqs = faqs;
    });
  }

}
