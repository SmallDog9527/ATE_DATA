#pragma once
#include "Test_Method.h"

#include "stdafx.h"
extern Test_Method test_method;

extern int I2CSet(float Time, UINT sda0, UINT clk0, UINT sda1 = -1, UINT clk1= -1, UINT sda2 = -1, UINT clk2 = -1, UINT sda3 = -1, UINT clk3 = -1);
//extern int I2CWriteData(int SAddress, int RegAddress, int val0=0, int val1=0, int val2=0, int val3=0);
extern int I2CCompareData(int *SAddress, int *RegAddress, BYTE siteNO , char* data);
extern int I2CReadData(int SAddress,int RegAddress, int datacount);
extern int I2CGetReadData(BYTE siteID, int number);
extern int I2CGetFinalline();
//extern int I2CInitial();

class SEL_UNIT  {
public:
	void set_working(int sel_value, int site)
	{
		working[site]=sel_value;
	}
	void init(int sel_value, int sel_total_bit, int sel_bit_in_reg, int site)
	{
		working[site]=sel_value;
		total_bit = sel_total_bit;
		bit_in_reg = sel_bit_in_reg;
	}

	int total_bit;
	int bit_in_reg;
	int working[SITE_NUM];
};


class EEPROM_Interface
{
public:
	EEPROM_Interface(void) {}
	~EEPROM_Interface(void) {}

	void init();
	void I2C_init(float clk_period, bool debug);
	BOOL EEPROM_Read(const char* reg_str, int *EE_READ, double *EE_IQ);
	BOOL EEPROM_Burn(const char* reg_str, bool burn_flag[SITE_NUM]);
	BOOL EEPROM_Preview(const char* reg_str);
	BOOL EEPROM_Preview(const char* reg_str, int instruction, int tm_data);
	BOOL EEPROM_Enter_Test_Mode(int instruction, int tm_data);
	int get_bank(int reg);
	void Run_15_cycle(float pat_delay);

private:
	void construction_instru_reg(int *target){
		int k;
		SERIAL target[SITE]=0;
		SERIAL 
			for(k=0;k<read.total_bit;k++)
			   target[SITE]=target[SITE]|(((read.working[SITE]&(1<<(read.total_bit-k-1)))>>(read.total_bit-k-1))<<(read.bit_in_reg-k));
		SERIAL 
			for (k=0;k<write.total_bit;k++)
			   target[SITE]=target[SITE]|(((write.working[SITE]&(1<<(write.total_bit-k-1)))>>(write.total_bit-k-1))<<(write.bit_in_reg-k));
		SERIAL 
			for (k=0;k<preview.total_bit;k++)
			   target[SITE]=target[SITE]|(((preview.working[SITE]&(1<<(preview.total_bit-k-1)))>>(preview.total_bit-k-1))<<(preview.bit_in_reg-k));
		SERIAL 
			for (k=0;k<testmode.total_bit;k++)
			   target[SITE]=target[SITE]|(((testmode.working[SITE]&(1<<(testmode.total_bit-k-1)))>>(testmode.total_bit-k-1))<<(testmode.bit_in_reg-k));

		SERIAL {
			if(testmode.working[SITE]){
				for (k=0;k<MUX.total_bit;k++)
				   target[SITE]=target[SITE]|(((MUX.working[SITE]&(1<<(MUX.total_bit-k-1)))>>(MUX.total_bit-k-1))<<(MUX.bit_in_reg-k));
			}else {
				for (k=0;k<EE_SEL.total_bit;k++)
				   target[SITE]=target[SITE]|(((EE_SEL.working[SITE]&(1<<(EE_SEL.total_bit-k-1)))>>(EE_SEL.total_bit-k-1))<<(EE_SEL.bit_in_reg-k));
			}
		}
	}

	SEL_UNIT read;
	SEL_UNIT write;
	SEL_UNIT preview;
	SEL_UNIT testmode;
	SEL_UNIT MUX;
	SEL_UNIT EE_SEL;
	int data_bit[SITE_NUM];
	int inst_bit[SITE_NUM];
	int sdi_ch[SITE_NUM];
	int clk_ch[SITE_NUM];
};